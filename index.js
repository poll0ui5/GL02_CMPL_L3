const fs = require("fs");
const colors = require("colors");
const cli = require("@caporal/core").default;
const inquirer = require("inquirer");
const ScheduleService = require("./ScheduleService");

const service = new ScheduleService();

function parseDate(value, label) {
    if (!value) {
        throw new Error(`Date ${label} manquante`);
    }
    const parts = value.split("-");
    if (parts.length !== 3) {
        throw new Error(`Format de date ${label} invalide, attendu AAAA-MM-JJ: ${value}`);
    }
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    return new Date(y, m, d);
}

/**
 * Génère une frise chronologique ASCII pour une journée (08h-20h)
 * 1 caractère = 30 minutes. [====] = Occupé, [....] = Libre
 */
function renderTimeline(freeIntervals) {
    const startHour = 8;
    const endHour = 20;
    const slotsPerHour = 2; // pas de 30 min
    const totalSlots = (endHour - startHour) * slotsPerHour; // 24 blocs

    // 1 = Occupé (défaut), 0 = Libre
    const timeline = new Array(totalSlots).fill(1); 

    freeIntervals.forEach(interval => {
        const [h1, m1] = interval.start.split(':').map(Number);
        const [h2, m2] = interval.end.split(':').map(Number);

        // Conversion heure -> index tableau
        let startIndex = (h1 - startHour) * slotsPerHour + (m1 / 30);
        let endIndex = (h2 - startHour) * slotsPerHour + (m2 / 30);

        // Sécurité bornes
        startIndex = Math.max(0, startIndex);
        endIndex = Math.min(totalSlots, endIndex);

        for (let i = startIndex; i < endIndex; i++) {
            timeline[i] = 0; // Marquer comme libre
        }
    });

    // Construction visuelle
    const visual = timeline.map(status => {
        return status === 1 ? "=".red : ".".green;
    }).join("");

    return `08h [${visual}] 20h`.white;
}

cli
    .version("Outil de suivi d'occupation des salles")
    .version("0.2.0")

    // F1 – Recherche de salles par cours
    .command("search-rooms", "Rechercher des salles par cours")
    .argument("<course>", "Le nom ou code du cours")
    .action(({ args, logger }) => {
        logger.info(`Recherche des salles pour le cours: ${args.course}`.blue);
        try {
            const rooms = service.searchRoomsByCourse(args.course);
            logger.info(`Salles pour le cours "${args.course}":`.blue);
            rooms.forEach(r => {
                logger.info(`${r.room} - ${r.capacity} lieux`.green);
            });
        } catch (e) {
            logger.error(e.message.red);
        }
    })

    // F2 – Capacité d’une salle
    .command("room-capacity", "Vérifier la capacité d’une salle")
    .argument("<room>", "le code de salle")
    .action(({ args, logger }) => {
        logger.info(`Capacité de récupération pour la salle: ${args.room}`.blue);
        try {
            const cap = service.getRoomCapacity(args.room);
            logger.info(
                `Salle ${args.room.toUpperCase()} a une capacité de ${cap} places`.green
            );
        } catch (e) {
            logger.error(e.message.red);
        }
    })

 // F3 – Créneaux libres d’une salle (Version Visuelle)
    .command("free-slots", "Obtenir des créneaux disponibles pour une salle")
    .argument("<room>", "le code de salle")
    .action(({ args, logger }) => {
        logger.info(`Disponibilités pour la salle: ${args.room}`.blue);
        try {
            const freeByDay = service.getFreeSlotsForRoom(args.room);
            const daysOrder = ['L', 'MA', 'ME', 'J', 'V'];

            logger.info("\nLégende : " + "[====]".red + " Occupé / " + "[....]".green + " Libre\n");

            daysOrder.forEach(day => {
                const intervals = freeByDay[day] || [];
                const timelineBar = renderTimeline(intervals);
                
                // Texte détaillé (ex: "10:00-12:00")
                let details = "";
                if (intervals.length === 0) {
                    details = "(Aucune plage libre)".yellow;
                } else {
                    details = intervals.map(i => `${i.start}-${i.end}`).join(", ");
                }

                logger.info(`${day.padEnd(2)} : ${timelineBar}  ${details.grey}`);
            });
            logger.info(""); 
        } catch (e) {
            logger.error(e.message.red);
        }
    })

    // F4 – Salles libres pour un créneau
    .command("available-rooms", "Trouver des salles disponibles pour un créneau horaire spécifique")
    .argument("<startTime>", "Heure de début (HH:MM)")
    .argument("<endTime>", "Heure de fin (HH:MM)")
    .argument("<day>", "Jour de la semaine pour vérifier la disponibilité (L, MA, ME, J, V)")
    .action(({ args, logger }) => {
        logger.info(
            `Trouver des salles disponibles de ${args.startTime} à ${args.endTime} le jour: ${args.day}`.blue
        );
        try {
            const rooms = service.getAvailableRooms(args.startTime, args.endTime, args.day);
            if (rooms.length === 0) {
                logger.warn("Aucune salle disponible pour ce créneau.".yellow);
            } else {
                logger.info(
                    `Toutes les salles disponibles de ${args.startTime} à ${args.endTime} le jour : ${args.day}`.green
                );
                rooms.forEach(room => logger.info(`Salle ${room}`));
            }
        } catch (e) {
            logger.error(e.message.red);
        }
    })

    // F5 – Génération d’un fichier iCalendar
    .command("generate-icalendar", "Générer un fichier iCalendar (.ics) pour une planification utilisateur")
    .option(
        "-c, --courses <courses>",
        "Liste des codes de cours séparés par des virgules (ex: ME101, TP202)",
        { validator: cli.STRING }
    )
    .option("--start <date>", "Date de début (AAAA-MM-JJ)", {
        validator: cli.STRING,
        required: true
    })
    .option("--end <date>", "Date de fin (AAAA-MM-JJ)", {
        validator: cli.STRING,
        required: true
    })
    .option(
        "-o, --output <output>",
        "Chemin pour enregistrer le fichier iCalendar généré",
        { validator: cli.STRING, default: "./mon_agenda.ics" }
    )
    .option("--uid-domain <domain>", "Domaine utilisé pour les UID d’événements", {
        validator: cli.STRING,
        default: "edt.example.fr"
    })
    .action(({ options, logger }) => {
        logger.info("Génération du fichier iCalendar pour les cours sélectionnés...".blue);
        try {
            const periodStart = parseDate(options.start, "start");
            const periodEnd = parseDate(options.end, "end");

            let courses = null;
            if (options.courses) {
                courses = options.courses
                    .split(",")
                    .map(c => c.trim())
                    .filter(Boolean);
            }

            const ics = service.generateICalendar({
                courses,
                periodStart,
                periodEnd,
                uidDomain: options["uid-domain"]
            });

            if (!ics.includes("BEGIN:VEVENT")) {
                logger.warn(
                    "Aucun cours trouvé pour les paramètres demandés (cours + période). Export annulé."
                        .yellow
                );
            }

            fs.writeFileSync(options.output, ics, "utf8");
            logger.info(`Export réussi: ${options.output}`.green);
        } catch (e) {
            logger.error(
                `Erreur lors de la génération du fichier iCalendar: ${e.message}`.red
            );
        }
    })

    // F6 – Vérification des conflits de planning
    .command("check-conflicts", "Vérifier les conflits d’horaire")
    .action(({ logger }) => {
        logger.info("Vérification des conflits dans le calendrier".blue);
        try {
            const conflicts = service.checkConflicts();
            if (conflicts.length === 0) {
                logger.info("Données valides, aucune collision détectée".green);
            } else {
                conflicts.forEach(c => {
                    logger.warn(
                        `Salle ${c.room}, ${c.day} ` +
                        `${c.slot1.startTime}-${c.slot1.endTime} chevauche ` +
                        `${c.slot2.startTime}-${c.slot2.endTime}`.red
                    );
                });
            }
        } catch (e) {
            logger.error(e.message.red);
        }
    })

    // F7 – Statistiques d’occupation des salles
    .command("room-usage-stats", "Obtenir des statistiques sur l’utilisation de la salle")
    .action(({ logger }) => {
        logger.info("Statistiques d’utilisation de la salle de rassemblement...".blue);
        try {
            const { perRoom, average } = service.getRoomUsageStats();
            logger.info("Statistiques sur l’occupation des salles".yellow);
            Object.keys(perRoom).forEach(room => {
                logger.info(`${room}: ${perRoom[room].toFixed(2)}% occupé`.green);
            });
            logger.info(`\nTaux d'occupation moyen: ${average.toFixed(2)}%`.cyan);
        } catch (e) {
            logger.error(e.message.red);
        }
    })

    // F8 – Classement des salles par capacité
    .command("rank-rooms", "Classez les salles par leur capacité")
    .action(({ logger }) => {
        logger.info("Classement des salles par capacité...".blue);
        try {
            const ranking = service.rankRoomsByCapacity();
            ranking.forEach(item => {
                logger.info(
                    `${item.capacity} places: ${item.roomsCount} salle(s)`.green
                );
            });
        } catch (e) {
            logger.error(e.message.red);
        }
    })

    .command("export-csv", "Exporter les données d'emploi du temps au format CSV")
    .option("-o, --output <output>", "Chemin du fichier de sortie", { 
        validator: cli.STRING, 
        default: "./export_edt.csv" 
    })
    .action(({ options, logger }) => {
        try {
            const csvContent = service.generateCSV();
            fs.writeFileSync(options.output, csvContent, "utf8");
            logger.info(`Export CSV réussi : ${options.output}`.green);
        } catch (e) {
            logger.error(`Erreur lors de l'export CSV : ${e.message}`.red);
        }
    })
    // F9 – Meeting Finder
    .command("find-meeting", "Trouver des créneaux communs pour une liste de cours")
    .argument("<courses>", "Liste des cours séparés par des virgules (ex: GL02,SY02)")
    .action(({ args, logger }) => {
        logger.info(`Recherche de créneaux communs pour : ${args.courses}`.blue);
        try {
            const list = args.courses.split(",").map(c => c.trim());
            const slots = service.findCommonFreeSlots(list);

            if (slots.length === 0) {
                logger.warn("Aucun créneau commun trouvé.".yellow);
            } else {
                logger.info("✅ Créneaux disponibles :".green);
                slots.forEach(s => logger.info(`   ${s}`));
            }
        } catch (e) {
            logger.error(e.message.red);
        }
    })
    // F10 – Backup Room
    .command("backup-room", "Trouver une salle de remplacement en urgence")
    .argument("<room>", "La salle qui pose problème (ex: P104)")
    .action(({ args, logger }) => {
        logger.info(`Recherche alternative pour ${args.room}...`.blue);
        try {
            const result = service.findBackupRoom(args.room);
            logger.info(`Contexte : ${result.context.day} ${result.context.start}-${result.context.end}`.grey);

            if (result.candidates.length === 0) {
                logger.error("❌ Aucune salle équivalente trouvée.".red);
            } else {
                logger.info(`✅ ${result.candidates.length} alternatives trouvées :`.green);
                result.candidates.forEach((c, idx) => {
                    const icon = idx === 0 ? "🏆" : "👉";
                    logger.info(`${icon} Salle ${c.room} (${c.cap} places)`);
                });
            }
        } catch (e) {
            logger.error(e.message.red);
        }
    });


// --- MENU INTERACTIF ---
async function startMenu() {
    // On définit un petit logger pour remplacer celui de Caporal dans le menu
    const logger = {
        info: (msg) => console.log(msg),
        warn: (msg) => console.warn(msg),
        error: (msg) => console.error(msg)
    };

    const answer = await inquirer.prompt([
        {
            type: "list",
            name: "action",
            message: "MENU PRINCIPAL - Que souhaitez-vous faire ?",
            pageSize: 10,
            choices: [
                { name: "(F1) Rechercher des salles par cours", value: "F1" },
                { name: "(F2) Vérifier la capacité d'une salle", value: "F2" },
                { name: "(F3) Voir les créneaux libres d'une salle", value: "F3" },
                { name: "(F4) Trouver des salles libres (créneau)", value: "F4" },
                { name: "(F5) Exporter en iCalendar (.ics)", value: "F5" },
                { name: "(F6) Vérifier les conflits", value: "F6" },
                { name: "(F7) Statistiques d'occupation", value: "F7" },
                { name: "(F8) Classement des salles par capacité", value: "F8" },
                { name: "(CSV) Exporter les données en CSV", value: "CSV" },
                new inquirer.Separator(),
                { name: "Quitter", value: "quit" }
            ]
        }
    ]);

    switch (answer.action) {
        case "F1":
            const courseCodes = service.getAllCourseCodes();
            const f1 = await inquirer.prompt([{ 
                type: "list", 
                name: "course", 
                message: "Sélectionnez le code du cours :",
                choices: courseCodes,
                pageSize: 10
            }]);
            try {
                const rooms = service.searchRoomsByCourse(f1.course);
                rooms.forEach(r => logger.info(`${r.room} - ${r.capacity} places`.green));
            } catch (e) { logger.error(e.message.red); }
            break;

        case "F2": { 
            const rooms = service.getAllRooms();
            const f2 = await inquirer.prompt([{ 
                type: "list", 
                name: "room", 
                message: "Sélectionnez la salle :",
                choices: rooms,
                pageSize: 10
            }]);
            try {
                const cap = service.getRoomCapacity(f2.room);
                logger.info(`Salle ${f2.room.toUpperCase()} : ${cap} places`.green);
            } catch (e) { logger.error(e.message.red); }
            break;
        }

        case "F3":
            const rooms = service.getAllRooms();
            const f3 = await inquirer.prompt([{ 
                type: "list", 
                name: "room", 
                message: "Sélectionnez la salle :",
                choices: rooms,
                pageSize: 10
            }]);
            try {
                const freeByDay = service.getFreeSlotsForRoom(f3.room);
                // On force l'ordre des jours pour que ce soit propre
                const daysOrder = ['L', 'MA', 'ME', 'J', 'V'];
                
                // On affiche la légende
                console.log("\nLégende : " + "[====]".red + " Occupé / " + "[....]".green + " Libre\n");
                
                daysOrder.forEach(day => {
                    const intervals = freeByDay[day] || [];
                    // Appel de la fonction visuelle (assure-toi d'avoir bien collé la fonction renderTimeline en haut du fichier)
                    const timelineBar = renderTimeline(intervals);
                    
                    let details = intervals.length === 0 ? "" : intervals.map(i => `${i.start}-${i.end}`).join(", ");
                    logger.info(`${day.padEnd(2)} : ${timelineBar}  ${details.grey}`);
                });
            } catch (e) { logger.error(e.message.red); }
            break;

        case "F4":
            const f4 = await inquirer.prompt([
                { type: "input", name: "day", message: "Jour (L, MA, ME, J, V) :" },
                { type: "input", name: "start", message: "Heure de début (HH:MM) :" },
                { type: "input", name: "end", message: "Heure de fin (HH:MM) :" }
            ]);
            try {
                const rooms = service.getAvailableRooms(f4.start, f4.end, f4.day);
                if (rooms.length === 0) logger.warn("Aucune salle trouvée.".yellow);
                else rooms.forEach(r => logger.info(`- ${r}`.green));
            } catch (e) { logger.error(e.message.red); }
            break;

        case "F5":
            const f5 = await inquirer.prompt([
                { type: "input", name: "courses", message: "Codes des cours séparés par des virgules (ex: ME01,ME02) :" },
                { type: "input", name: "start", message: "Date de début (AAAA-MM-JJ) :" },
                { type: "input", name: "end", message: "Date de fin (AAAA-MM-JJ) :" },
                { type: "input", name: "output", message: "Nom du fichier (ex: agenda.ics) :", default: "mon_agenda.ics" }
            ]);
            try {
                const periodStart = parseDate(f5.start, "start");
                const periodEnd = parseDate(f5.end, "end");
                const courses = f5.courses.split(",").map(c => c.trim()).filter(Boolean);
                
                const ics = service.generateICalendar({ courses, periodStart, periodEnd });
                fs.writeFileSync(f5.output, ics, "utf8");
                logger.info(`Export réussi : ${f5.output}`.green);
            } catch (e) { logger.error(e.message.red); }
            break;

        case "F6":
            try {
                const conflicts = service.checkConflicts();
                if (conflicts.length === 0) logger.info("Aucun conflit détecté".green);
                else conflicts.forEach(c => logger.warn(`Conflit en ${c.room} (${c.day}) : ${c.slot1.startTime} chevauche ${c.slot2.startTime}`.red));
            } catch (e) { logger.error(e.message.red); }
            break;

        case "F7":
            try {
                const { perRoom, average } = service.getRoomUsageStats();
                Object.keys(perRoom).forEach(room => logger.info(`${room}: ${perRoom[room].toFixed(2)}%`.green));
                logger.info(`\nMoyenne globale: ${average.toFixed(2)}%`.cyan);
            } catch (e) { logger.error(e.message.red); }
            break;

        case "F8":
            try {
                const ranking = service.rankRoomsByCapacity();
                ranking.forEach(item => logger.info(`${item.capacity} places : ${item.roomsCount} salle(s)`.green));
            } catch (e) { logger.error(e.message.red); }
            break;

        case "F9":
            const f9 = await inquirer.prompt([{ type: "input", name: "courses", message: "Cours (ex: GL02,SY02) :" }]);
            try {
                const slots = service.findCommonFreeSlots(f9.courses.split(",").map(c => c.trim()));
                slots.forEach(s => logger.info(s.green));
            } catch (e) { logger.error(e.message.red); }
            break;

        case "F10":
            const f10 = await inquirer.prompt([{ type: "input", name: "room", message: "Salle HS :" }]);
            try {
                const res = service.findBackupRoom(f10.room);
                res.candidates.forEach(c => logger.info(`-> ${c.room} (${c.cap} places)`.green));
            } catch (e) { logger.error(e.message.red); }
            break;

        case "CSV":
            const fCsv = await inquirer.prompt([
                { 
                    type: "input", 
                    name: "output", 
                    message: "Nom du fichier CSV (ex: data.csv) :", 
                    default: "export_edt.csv" 
                }
            ]);
            try {
                const csv = service.generateCSV();
                fs.writeFileSync(fCsv.output, csv, "utf8");
                logger.info(`Export réussi : ${fCsv.output}`.green);
            } catch (e) { 
                logger.error(`Erreur : ${e.message}`.red); 
            }
            break;

        case "quit":
            console.log("Au revoir !");
            process.exit(0);
            break;
    }
}

// --- DÉMARRAGE ---
if (process.argv.slice(2).length === 0) {
    startMenu();
} else {
    cli.run(process.argv.slice(2));
}