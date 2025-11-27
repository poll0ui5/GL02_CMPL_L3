const DAY_ORDER = {
    "L": 1,
    "M": 2,
    "ME": 3,
    "J": 4,
    "V": 5,
}

class Creneau{
    /**
     * @param {Object} options
     * @param {string} options.codeCours   // CodeCours (course-code, ex: ME01)
     * @param {string} options.typeCours   // CM / TD / TP (mapped from C1/D1/T1)
     * @param {number} options.capacite    // numeric capacity
     * @param {string} options.jour        // L, MA, ME, J, V
     * @param {string} options.debut       // "HH:MM"
     * @param {string} options.fin         // "HH:MM"
     * @param {string} options.salle       // room code (4 chars)
     * @param {string} options.sousGroupe  // e.g. F1
     * @param {number|string} [options.groupeIndex] // optional group-index from CRU
     */
    constructor(options){
        this.codeCours = options.codeCours;
        this.typeCours = options.typeCours;
        this.capacite = options.capacite;
        this.jour = options.jour;
        this.debut = options.debut;
        this.fin = options.fin;
        this.salle = options.salle;
        this.sousGroupe = options.sousGroupe;
        this.groupeIndex = options.groupeIndex;
    }
}

module.exports = {
    Creneau,
}
