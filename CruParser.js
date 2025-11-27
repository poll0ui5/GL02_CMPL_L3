const Slot = require("./Slot");
const SlotSet = require("./SlotSet.js");

/**
 * Map raw lesson type (C1 / D1 / T1) to normalized type (CM / TD / TP).
 */
function mapLessonType(lt) {
    switch (lt) {
        case "C1":
            return "CM";
        case "D1":
            return "TD";
        case "T1":
            return "TP";
        default:
            return lt;
    }
}

/**
 * Parse one slot line.
 *
 * Actual format : 1,D1,P=24,H=MA 10:00-12:00,F1,S=C104//
 *
 * ABNF:
 *   slot-line = group-index "," lesson-type "," "P=" capacity ","
 *               "H=" day " " time-slot ","
 *               subgroup "," "S=" room-code "//"
 *
 * group-index = DIGIT
 * lesson-type = "C1" / "D1" / "T1"
 * capacity    = 1*3DIGIT
 * day         = "L" / "MA" / "ME" / "J" / "V"
 * time-slot   = time "-" time
 * time        = 2DIGIT ":" 2DIGIT
 * subgroup    = ALPHA DIGIT ; ex: F1, F2
 * room-code   = 4(ALPHA / DIGIT)
 */
function parseSlotLine(line, currentCourseCode) {
    // Allows optional spaces around commas and equal signs
    const slotRegex =
        /^(\d+)\s*,\s*(C1|D1|T1)\s*,\s*P=\s*(\d{1,3})\s*,\s*H=\s*(L|MA|ME|J|V)\s+(\d{2}:\d{2})-(\d{2}:\d{2})\s*,\s*([A-Za-z]\d)\s*,\s*S=\s*([A-Za-z0-9]{4})\/\/\s*$/;

    const m = line.match(slotRegex);
    if (!m) {
        throw new Error("Invalid slot-line: " + line);
    }

    const groupIndex = parseInt(m[1], 10);
    const lessonTypeRaw = m[2];
    const capacity = parseInt(m[3], 10);
    const day = m[4];
    const startTime = m[5];
    const endTime = m[6];
    const subgroup = m[7];
    const room = m[8];

    const lessonType = mapLessonType(lessonTypeRaw);

    return new Slot({
        courseCode: currentCourseCode,
        lessonType,
        capacity,
        day,
        startTime,
        endTime,
        room,
        subgroup,
        groupIndex
    });
}




