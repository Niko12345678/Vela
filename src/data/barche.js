/* Mette la flotta su globalThis, dove il gioco la trova.

   Stesso motivo delle carte (vedi data/carte.js): src/legacy/game.js non
   può avere import propri, perché la harness lo esegue dentro una
   `new Function` e lì una dichiarazione import è un errore di sintassi.
   Va quindi importato PRIMA di game.js.

   Fuori da `k`, ogni barca porta anche `prezzo` (euro, quanto costa in
   carriera) e `stiva` (tonnellate di carico che regge): non sono fisica,
   la fisica non li guarda, ma decidono quali incarichi puoi accettare.

   ─ Glossario delle costanti di src/data/barche.json ─
   Sono i vecchi commenti di `const K`, che il JSON non può portarsi dietro.

     SAIL_MAIN   ½·ρ·superficie randa
     REEF        mani di terzaroli: frazione di randa che resta. Il primo
                 elemento è sempre 1 (tutto ferro); la lunghezza dell'array
                 dice quante mani ha la barca.
     SAIL_JIB    ½·ρ·superficie fiocco
     SAIL_SPI    ½·ρ·superficie spinnaker. A 0 la barca non ce l'ha.
     CLmax       portanza massima della vela: quanto punta alto
     CD0/CDmax   resistenza a incidenza nulla e a vela in bandiera
     MASS        dislocamento (kg): dà abbrivio, non cambia il regime
     HULL_F      resistenza longitudinale quadratica dello scafo
     LIN_F       resistenza longitudinale lineare
     HULL_L      resistenza laterale quadratica: contrasta lo scarroccio
     LIN_L       resistenza laterale lineare
     RUDDER      efficacia del timone
     VHULL       velocità critica dello scafo (m/s): il muro dell'onda
     WAVE        durezza di quel muro
     YAWTAU      inerzia di rotazione: la barca non gira all'istante
     YAW         conversione forza laterale -> momento di imbardata
     ARM_M/ARM_J bracci: randa a poppavia, fiocco a proravia del centro di deriva
     STIFF       rigidezza (N): forza laterale che sbanda la barca a fondo.
                 Più è bassa, prima la barca si corica e sfoga il vento.
     PESCAGGIO   metri sotto la chiglia: sotto questa profondità si tocca
     LOA         lunghezza fuori tutto (m), usata anche dal disegno         */
import barche from "./barche.json" with { type: "json" };

globalThis.VELA_BARCHE = barche;
