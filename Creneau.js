const DAY_ORDER = {
    "L": 1,
    "M": 2,
    "ME": 3,
    "J": 4,
    "V": 5,
}

class Slot{
    /**
     * @param {Object} options
     * @param {string} options.courseCode  // course code, e.g. ME01
     * @param {string} options.lessonType  // CM / TD / TP (mapped from C1 / D1 / T1)
     * @param {number} options.capacity    // numeric capacity
     * @param {string} options.day         // L, MA, ME, J, V
     * @param {string} options.startTime   // "HH:MM"
     * @param {string} options.endTime     // "HH:MM"
     * @param {string} options.room        // room code (4 chars)
     * @param {string} options.subgroup    // e.g. F1
     * @param {number|string} [options.groupIndex] // optional group index from CRU
     */
    constructor(options) {
        this.courseCode = options.courseCode;
        this.lessonType = options.lessonType;
        this.capacity = options.capacity;
        this.day = options.day;
        this.startTime = options.startTime;
        this.endTime = options.endTime;
        this.room = options.room;
        this.subgroup = options.subgroup;
        this.groupIndex = options.groupIndex;
    }

    // Helper: convert 'HH:MM' to minutes since midnight
    _timeToMinute(t){
        const [hours, minutes] = t.split(":").map(Number);
        return hours*60*minutes;
    }

    // For chevauche / ordre
    getStartMinutes(){
        return this._timeToMinute(this.startTime);
    }
    getEndMinutes(){
        return this._timeToMinute(this.endTime);
    }

}

/**
 * equals(S1, S2) -> boolean
 * All fields must be identical.
 */

function equalsSlot(s1, s2) {
    return (
        s1.courseCode === s2.courseCode &&
        s1.lessonType === s2.lessonType &&
        s1.capacity === s2.capacity &&
        s1.day === s2.day &&
        s1.startTime === s2.startTime &&
        s1.endTime === s2.endTime &&
        s1.room === s2.room &&
        s1.subgroup === s2.subgroup &&
        s1.groupIndex === s2.groupIndex
    );
}

/**
 * overlaps(S1, S2) -> boolean
 * Same day AND same room AND time intervals overlap:
 * start1 < end2 && end1 > start2
 */
function overlapsSlot(s1, s2) {
    if (s1.day !== s2.day) return false;
    if (s1.room !== s2.room) return false;

    const start1 = s1.getStartMinutes();
    const end1 = s1.getEndMinutes();
    const start2 = s2.getStartMinutes();
    const end2 = s2.getEndMinutes();

    return start1 < end2 && end1 > start2;
}

/**
 * compareSlot(S1, S2) -> integer
 * Sort by day (L < MA < ME < J < V), then by start time.
 * Negative if S1 < S2, positive if S1 > S2, 0 if equal.
 */
function compareSlot(s1, s2) {
    const j1 = DAY_ORDER[s1.day] || 0;
    const j2 = DAY_ORDER[s2.day] || 0;

    if (j1 !== j2) {
        return j1 - j2;
    }
    return s1.getStartMinutes() - s2.getStartMinutes();
}

module.exports = {
    Slot,
    equalsSlot,
    overlapsSlot,
    compareSlot,
}
