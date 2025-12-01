// F4.js
//
// Renvoie les salles libres pour un créneau donné :
// - jour : "L", "MA", "ME", "J", "V"
// - start : "HH:MM"
// - end : "HH:MM"

function convertToMinutes(h) {
    const [H, M] = h.split(":").map(Number);
    return H * 60 + M;
}

function sallesLibresPourCreneau(slots, day, start, end) {
    const startMin = convertToMinutes(start);
    const endMin = convertToMinutes(end);

    // Récupérer toutes les salles existantes
    const allRooms = [...new Set(slots.map(s => s.room))];

    const roomsBusy = new Set();

    for (const slot of slots) {
        if (slot.day !== day) continue;

        const s1 = convertToMinutes(slot.startTime);
        const e1 = convertToMinutes(slot.endTime);

        // Condition de chevauchement (du cahier des charges)
        const chevauche = s1 < endMin && e1 > startMin;

        if (chevauche) {
            roomsBusy.add(slot.room);
        }
    }

    // Toutes les salles qui NE SONT PAS occupées
    return allRooms.filter(r => !roomsBusy.has(r));
}

module.exports = { sallesLibresPourCreneau };
