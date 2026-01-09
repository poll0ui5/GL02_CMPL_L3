const fs = require("fs");
const path = require("path");
const CruParser = require("./CruParser");
const SlotSet = require("./SlotSet");
const Slot = require("./Slot");

const DAY_CODES = ['L', 'MA', 'ME', 'J', 'V'];
const OPEN_MINUTES = 8 * 60;   // 08:00
const CLOSE_MINUTES = 20 * 60; // 20:00
const TOTAL_AVAILABLE_HOURS = 60; // 12h x 5 jours

class ScheduleService {
    constructor(baseDir = path.join(__dirname, "data")) {
        this.baseDir = baseDir;
        this.cruParser = new CruParser();
    }

    // ---------- Helpers ----------

    /**
     * Load all edt.cru from the subdirs baseDir and return SlotSet.
     * @throws Error is there is no file or folder.
     */
    getAllSlots() {
        if (!fs.existsSync(this.baseDir)) {
            throw new Error('Impossible de trouver le répertoire "data". Veuillez d’abord importer les fichiers CRU.');
        }

        const subDirs = fs.readdirSync(this.baseDir, { withFileTypes: true })
            .filter(d => d.isDirectory())
            .map(d => path.join(this.baseDir, d.name));

        let slotsSet = SlotSet.empty();
        let hasFiles = false;

        subDirs.forEach(dir => {
            const cruFile = path.join(dir, 'edt.cru');
            if (fs.existsSync(cruFile)) {
                hasFiles = true;
                const data = fs.readFileSync(cruFile, 'utf8');
                const slots = this.cruParser.parse(data).toArray();
                slots.forEach(slot => slotsSet.add(slot));
            }
        });

        if (!hasFiles) {
            throw new Error('Aucun fichier edt.cru trouvé dans les sous-répertoires de données.');
        }

        if (slotsSet.toArray().length === 0) {
            throw new Error('Aucun créneau trouvé dans les données CRU.');
        }

        return slotsSet;
    }

    _toMinutes(timeStr) {
        const [h, m] = timeStr.split(':').map(Number);
        return h * 60 + m;
    }

    _formatTime(minutes) {
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    _mergeIntervals(intervals) {
        if (intervals.length === 0) return [];
        intervals.sort((a, b) => a.start - b.start);

        const merged = [intervals[0]];
        for (let i = 1; i < intervals.length; i++) {
            const last = merged[merged.length - 1];
            const current = intervals[i];

            if (current.start <= last.end) {
                last.end = Math.max(last.end, current.end);
            } else {
                merged.push({ ...current });
            }
        }
        return merged;
    }

    _validateDay(day) {
        if (!DAY_CODES.includes(day)) {
            throw new Error('Jour invalide. Utilisez l’un de: L, MA, ME, J, V.');
        }
    }

    _validateTime(label, t) {
        const m = /^(\d{1,2}):(\d{2})$/.exec(t);
        if (!m) {
            throw new Error(`Format de temps ${label} invalide, attendu HH:MM: ${t}`);
        }
        const hh = parseInt(m[1], 10);
        const mm = parseInt(m[2], 10);
        if (hh < 0 || hh > 23 || mm < 0 || mm > 59) {
            throw new Error(`Valeur de temps ${label} invalide: ${t}`);
        }
    }

    // ---------- F1: Recherche de salles par cours ----------

    /**
     * F1 – Recherche de salles par cours.
     * @returns {Array<{room:string, capacity:number}>}
     * @param {string} courseCode
     */
    searchRoomsByCourse(courseCode) {
        const slotSet = this.getAllSlots();
        const filteredSlots = slotSet
            .filter(slot => slot.courseCode === courseCode)
            .toArray();

        if (filteredSlots.length === 0) {
            throw new Error(`Cours inconnu: ${courseCode}`);
        }

        const roomCap = new Map();
        filteredSlots.forEach(slot => {
            const room = slot.room.toUpperCase();
            const prev = roomCap.has(room) ? roomCap.get(room) : 0;
            roomCap.set(room, Math.max(prev, slot.capacity));
        });

        return Array.from(roomCap.entries()).map(([room, capacity]) => ({
            room,
            capacity
        }));
    }

    // ---------- F2: Capacité d’une salle ----------

    /**
     * F2 – Capacité d’une salle.
     * @param {string} roomCode
     */
    getRoomCapacity(roomCode) {
        const slotSet = this.getAllSlots();
        const slots = slotSet.toArray();
        const caps = [];

        const roomUpper = roomCode.toUpperCase();
        slots.forEach(slot => {
            if (slot.room && slot.room.toUpperCase() === roomUpper) {
                caps.push(slot.capacity);
            }
        });

        if (caps.length === 0) {
            throw new Error(`Salle "${roomCode}" introuvable dans la base de données.`);
        }

        return Math.max(...caps);
    }

    // ---------- F3: Créneaux libres d’une salle ----------

    /**
     * F3 – Créneaux libres d’une salle.
     * @returns {Record<string, Array<{start:string,end:string}>>}
     * @param {string} roomCode
     */
    getFreeSlotsForRoom(roomCode) {
        const slotSet = this.getAllSlots();
        const allSlots = slotSet.toArray();
        const roomUpper = roomCode.toUpperCase();

        const roomExists = allSlots.some(
            s => s.room && s.room.toUpperCase() === roomUpper
        );
        if (!roomExists) {
            throw new Error(`Salle inconnue: ${roomCode}`);
        }

        const filteredSlots = slotSet
            .filter(slot => slot.room && slot.room.toUpperCase() === roomUpper)
            .toArray();

        const busyByDay = {};
        DAY_CODES.forEach(d => busyByDay[d] = []);

        filteredSlots.forEach(slot => {
            if (!DAY_CODES.includes(slot.day)) return;
            const start = this._toMinutes(slot.startTime);
            const end = this._toMinutes(slot.endTime);
            busyByDay[slot.day].push({ start, end });
        });

        const result = {};

        DAY_CODES.forEach(day => {
            const mergedBusy = this._mergeIntervals(busyByDay[day]);
            const freeIntervals = [];
            let current = OPEN_MINUTES;

            for (const interval of mergedBusy) {
                if (interval.start > current) {
                    freeIntervals.push({ start: current, end: interval.start });
                }
                current = Math.max(current, interval.end);
            }

            if (current < CLOSE_MINUTES) {
                freeIntervals.push({ start: current, end: CLOSE_MINUTES });
            }

            result[day] = freeIntervals.map(({ start, end }) => ({
                start: this._formatTime(start),
                end: this._formatTime(end)
            }));
        });

        return result;
    }

    // ---------- F4: Sllaes libres pour un créneau ----------

    /**
     * F4 – Sllaes libres pour un créneau.
     * @returns {string[]} tableau de codes d’audience
     * @param {string} startTime
     * @param {string} endTime
     * @param {string} day
     */
    getAvailableRooms(startTime, endTime, day) {
        this._validateTime('start', startTime);
        this._validateTime('end', endTime);
        this._validateDay(day);

        const slotSet = this.getAllSlots();
        const allSlots = slotSet.toArray();

        const slotToReserve = new Slot({
            courseCode: "",
            lessonType: "",
            capacity: 0,
            startTime,
            endTime,
            day,
            room: "",
            subgroup: "",
            groupIndex: ""
        });

        const allRooms = [...new Set(allSlots.map(s => s.room))];
        const roomsBusy = new Set();

        allSlots.forEach(slot => {
            slotToReserve.room = slot.room;
            if (slot.overlapsSlot(slotToReserve)) {
                roomsBusy.add(slot.room);
            }
        });

        return allRooms.filter(room => !roomsBusy.has(room));
    }

    // ---------- F5: Génération d’un fichier iCalendar ----------

    /**
     * F5 – Génération d’un fichier iCalendar.
     * @param {Object} params
     * @param {string[]|null} params.courses
     * @param {Date} params.periodStart
     * @param {Date} params.periodEnd
     * @param {string} params.uidDomain
     * @returns {string} содержимое .ics
     */
    generateICalendar({ courses = null, periodStart, periodEnd, uidDomain }) {
        if (!(periodStart instanceof Date) || isNaN(periodStart.valueOf())) {
            throw new Error("Invalid periodStart date");
        }
        if (!(periodEnd instanceof Date) || isNaN(periodEnd.valueOf())) {
            throw new Error("Invalid periodEnd date");
        }
        if (periodEnd < periodStart) {
            throw new Error("La date de fin doit être après la date de début.");
        }

        const slotSet = this.getAllSlots();
        return this.cruParser.toICalendar(slotSet, {
            courses,
            periodStart,
            periodEnd,
            uidDomain
        });
    }

    // ---------- F6: Vérification des conflits de planning ----------

    /**
     * F6 – Vérification des conflits de planning.
     * @returns {Array<{room:string, day:string, slot1:Slot, slot2:Slot}>}
     */
    checkConflicts() {
        const slotSet = this.getAllSlots();
        const slots = slotSet.toArray();

        slots.sort((a, b) => {
            const cmp = a.compareSlot(b);
            if (cmp !== 0) return cmp;
            return (a.room || '').localeCompare(b.room || '');
        });

        const conflicts = [];
        const n = slots.length;

        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                if (slots[i].overlapsSlot(slots[j])) {
                    conflicts.push({
                        room: slots[i].room,
                        day: slots[i].day,
                        slot1: slots[i],
                        slot2: slots[j]
                    });
                }
            }
        }

        return conflicts;
    }

    // ---------- F7: Statistiques d’occupation des salles ----------

    /**
     * F7 – Statistiques d’occupation des salles загрузки аудиторий.
     * @returns {{perRoom: Record<string, number>, average:number}}
     *          perRoom[room] = pourcentage
     */
    getRoomUsageStats() {
        const slotSet = this.getAllSlots();
        const slots = slotSet.toArray();

        const roomStats = {};

        slots.forEach(slot => {
            const [sh, sm] = slot.startTime.split(":").map(Number);
            const [eh, em] = slot.endTime.split(":").map(Number);

            const duration = (eh * 60 + em) - (sh * 60 + sm);
            if (!roomStats[slot.room]) {
                roomStats[slot.room] = 0;
            }
            roomStats[slot.room] += duration;
        });

        const perRoom = {};
        let sumRates = 0;
        let roomsCount = 0;

        Object.keys(roomStats).forEach(room => {
            const usedHours = roomStats[room] / 60;
            const rate = (usedHours / TOTAL_AVAILABLE_HOURS) * 100;
            perRoom[room] = rate;
            sumRates += rate;
            roomsCount++;
        });

        return {
            perRoom,
            average: roomsCount ? sumRates / roomsCount : 0
        };
    }

    // ---------- F8: Classement des salles par capacité ----------

    /**
     * F8 – Classement des salles par capacité.
     * @returns {Array<{capacity:number, roomsCount:number}>}
     */
    rankRoomsByCapacity() {
        const slotSet = this.getAllSlots();
        const slots = slotSet.toArray();

        const capacityMap = {};

        slots.forEach(slot => {
            if (!capacityMap[slot.capacity]) {
                capacityMap[slot.capacity] = new Set();
            }
            capacityMap[slot.capacity].add(slot.room);
        });

        return Object.keys(capacityMap)
            .map(Number)
            .sort((a, b) => b - a)
            .map(cap => ({
                capacity: cap,
                roomsCount: capacityMap[cap].size
            }));
    }

    /**
    * Génère un contenu CSV à partir des créneaux chargés.
    * @returns {string} Le contenu au format CSV.
    */
    generateCSV() {
        const slotSet = this.getAllSlots();
        const slots = slotSet.toArray();

        const header = "Cours,Type,Capacité,Jour,Début,Fin,Salle,Sous-groupe";
    
        const rows = slots.map(slot => {
            return [
                slot.courseCode,
                slot.lessonType,
                slot.capacity,
                slot.day,
                slot.startTime,
                slot.endTime,
                slot.room,
                slot.subgroup
            ].join(",");
        });

        return [header, ...rows].join("\n");
    }


    /**
     * Récupère la liste unique de tous les codes de cours présents dans les données.
     * @returns {string[]}
     */
    getAllCourseCodes() {
        const slots = this.getAllSlots().toArray();
        return [...new Set(slots.map(s => s.courseCode))].sort();
    }

    /**
     * Récupère la liste unique de toutes les salles présentes dans les données.
     * @returns {string[]}
     */
    getAllRooms() {
        const slots = this.getAllSlots().toArray();
        return [...new Set(slots.map(s => s.room))].filter(Boolean).sort();
    }
}

module.exports = ScheduleService;
