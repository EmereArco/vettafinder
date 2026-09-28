import generated from './peaks.generated.json';

export type Peak = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  ele: number; // metri s.l.m.
  area: string; // gruppo / sottosezione
  region: string; // Piemonte, Valle d'Aosta, Francia, Svizzera, Liguria, Lombardia
  source?: 'base' | 'osm';
  prom?: number; // prominenza topografica (m), se nota
  iso?: number; // isolamento: km dalla cima più alta più vicina
  major?: boolean; // cima che "svetta": prominenza ≥ 600 m o isolamento ≥ 12 km
};

// Elenco scritto a mano: coordinate approssimate. In fase di build viene sostituito
// dalle cime di OpenStreetMap (scripts/fetch-peaks.ts), da cui prende nomi e gruppi.
type Row = [string, number, number, number, string, string];

const ROWS: Row[] = [
  // --- Monte Rosa, Cervino e Pennine ---
  ['Punta Dufour (Monte Rosa)', 45.9369, 7.8668, 4634, 'Monte Rosa', 'Svizzera'],
  ['Punta Gnifetti', 45.9272, 7.8767, 4554, 'Monte Rosa', 'Piemonte'],
  ['Lyskamm Orientale', 45.9225, 7.8358, 4527, 'Monte Rosa', "Valle d'Aosta"],
  ['Piramide Vincent', 45.9147, 7.8761, 4215, 'Monte Rosa', 'Piemonte'],
  ['Castore', 45.9197, 7.7911, 4228, 'Monte Rosa', "Valle d'Aosta"],
  ['Breithorn Occidentale', 45.9411, 7.7483, 4164, 'Monte Rosa', "Valle d'Aosta"],
  ['Cervino', 45.9763, 7.6586, 4478, 'Alpi Pennine', "Valle d'Aosta"],
  ["Dent d'Hérens", 45.9703, 7.605, 4171, 'Alpi Pennine', "Valle d'Aosta"],
  ['Grand Combin', 45.9375, 7.2992, 4314, 'Alpi Pennine', 'Svizzera'],
  ['Corno Bianco', 45.8158, 7.8897, 3320, 'Alpi Pennine', 'Piemonte'],
  ['Monte Tagliaferro', 45.8358, 8.0342, 2964, 'Valsesia', 'Piemonte'],
  ['Monte Mars', 45.6536, 7.9719, 2600, 'Alpi Biellesi', 'Piemonte'],
  ['Monte Mucrone', 45.6283, 7.9536, 2335, 'Alpi Biellesi', 'Piemonte'],
  ['Monte Camino', 45.644, 7.987, 2391, 'Alpi Biellesi', 'Piemonte'],
  ['Monte Barone', 45.7044, 8.1339, 2044, 'Alpi Biellesi', 'Piemonte'],
  ['Monte Emilius', 45.6792, 7.3847, 3559, 'Alpi Graie', "Valle d'Aosta"],
  ['Becca di Nona', 45.6936, 7.3536, 3142, 'Alpi Graie', "Valle d'Aosta"],

  // --- Ossola e Lepontine ---
  ['Weissmies', 46.1275, 8.0117, 4017, 'Alpi Pennine', 'Svizzera'],
  ["Pizzo d'Andolla", 46.1033, 8.0667, 3656, 'Val Antrona', 'Piemonte'],
  ['Monte Leone', 46.2497, 8.1103, 3553, 'Alpi Lepontine', 'Piemonte'],
  ["Punta d'Arbola", 46.3969, 8.3194, 3235, 'Alpi Lepontine', 'Piemonte'],
  ['Monte Zeda', 46.0319, 8.5008, 2156, 'Val Grande', 'Piemonte'],
  ['Gridone (Limidario)', 46.1311, 8.6433, 2188, 'Alpi Lepontine', 'Piemonte'],
  ['Mottarone', 45.8808, 8.4538, 1492, 'Prealpi Cusio-Ossola', 'Piemonte'],

  // --- Gran Paradiso e Canavese ---
  ['Gran Paradiso', 45.5181, 7.2669, 4061, 'Gran Paradiso', "Valle d'Aosta"],
  ['Grivola', 45.5958, 7.2567, 3969, 'Gran Paradiso', "Valle d'Aosta"],
  ['Herbetet', 45.5494, 7.2717, 3778, 'Gran Paradiso', "Valle d'Aosta"],
  ['Ciarforon', 45.4886, 7.2172, 3642, 'Gran Paradiso', 'Piemonte'],
  ['Rosa dei Banchi', 45.5536, 7.5153, 3164, 'Gran Paradiso', 'Piemonte'],
  ['Monte Marzo', 45.5497, 7.6892, 2756, 'Canavese', 'Piemonte'],
  ['Monte Quinseina', 45.4581, 7.6533, 2344, 'Canavese', 'Piemonte'],
  ['Tsanteleina', 45.4814, 7.0594, 3602, 'Alpi Graie', 'Confine IT/FR'],
  ['Aiguille de la Grande Sassière', 45.4903, 6.9975, 3751, 'Alpi Graie', 'Confine IT/FR'],

  // --- Valli di Lanzo e Moncenisio ---
  ['Levanna Centrale', 45.4069, 7.1628, 3619, 'Valli di Lanzo', 'Confine IT/FR'],
  ['Uja di Ciamarella', 45.3172, 7.1386, 3676, 'Valli di Lanzo', 'Piemonte'],
  ['Albaron', 45.3311, 7.0575, 3637, 'Alta Moriana', 'Francia'],
  ['Bessanese', 45.2917, 7.1133, 3604, 'Valli di Lanzo', 'Confine IT/FR'],
  ['Croce Rossa', 45.266, 7.087, 3566, 'Valli di Lanzo', 'Confine IT/FR'],
  ['Rocciamelone', 45.2032, 7.0773, 3538, 'Val di Susa', 'Piemonte'],
  ['Pointe de Charbonnel', 45.2911, 6.9869, 3752, 'Alta Moriana', 'Francia'],
  ['Monte Civrari', 45.1522, 7.3197, 2302, 'Valli di Lanzo', 'Piemonte'],
  ['Monte Musinè', 45.1169, 7.4553, 1150, 'Val di Susa', 'Piemonte'],

  // --- Val di Susa, Chisone, Germanasca ---
  ['Pierre Menue (Aiguille de Scolette)', 45.1753, 6.8778, 3506, 'Val di Susa', 'Confine IT/FR'],
  ['Punta Sommeiller', 45.1389, 6.8453, 3333, 'Val di Susa', 'Confine IT/FR'],
  ['Monte Niblè', 45.1161, 6.8603, 3365, 'Val di Susa', 'Confine IT/FR'],
  ['Mont Thabor', 45.1086, 6.5617, 3178, 'Valle Stretta', 'Francia'],
  ['Monte Chaberton', 44.965, 6.7508, 3131, 'Alta Val di Susa', 'Francia'],
  ['Punta Rognosa di Sestriere', 44.9586, 6.8858, 3280, 'Alta Val di Susa', 'Piemonte'],
  ['Punta Ramiere (Bric Froid)', 44.8768, 6.9423, 3303, 'Val Germanasca', 'Confine IT/FR'],
  ['Monte Albergian', 45.0, 7.0508, 3041, 'Val Chisone', 'Piemonte'],
  ['Monte Orsiera', 45.0472, 7.1464, 2890, 'Val Chisone', 'Piemonte'],
  ['Rocca Sella', 45.1144, 7.3869, 1508, 'Val di Susa', 'Piemonte'],
  ['Monte Freidour', 44.9372, 7.2536, 1445, 'Val Chisone', 'Piemonte'],

  // --- Colline e pianura ---
  ['Superga', 45.0806, 7.7672, 672, 'Collina di Torino', 'Piemonte'],
  ['Bric della Maddalena', 45.0406, 7.7328, 715, 'Collina di Torino', 'Piemonte'],
  ['Rocca di Cavour', 44.7867, 7.3742, 462, 'Pianura pinerolese', 'Piemonte'],

  // --- Monviso, Val Pellice, Varaita, Maira ---
  ['Monviso', 44.6673, 7.0906, 3841, 'Monviso', 'Piemonte'],
  ['Monte Granero', 44.74, 7.055, 3171, 'Val Pellice', 'Confine IT/FR'],
  ['Monte Meidassa', 44.763, 7.066, 3105, 'Val Pellice', 'Confine IT/FR'],
  ['Monte Frioland', 44.7461, 7.1522, 2720, 'Val Pellice', 'Piemonte'],
  ['Pelvo d\'Elva', 44.5433, 7.0572, 3064, 'Val Maira', 'Piemonte'],
  ['Monte Chersogno', 44.4944, 7.0889, 3026, 'Val Maira', 'Piemonte'],
  ['Rocca la Meja', 44.4228, 7.1147, 2831, 'Val Grana', 'Piemonte'],
  ['Monte Oronaye', 44.4819, 6.9272, 3100, 'Valle Stura', 'Confine IT/FR'],
  ['Aiguille de Chambeyron', 44.5372, 6.8528, 3412, 'Ubaye', 'Francia'],
  ['Tête des Toillies', 44.6581, 6.8753, 3175, 'Queyras', 'Francia'],
  ['Pic de la Font Sancte', 44.6589, 6.7389, 3385, 'Queyras', 'Francia'],
  ['Pic de Rochebrune', 44.8211, 6.7108, 3320, 'Queyras', 'Francia'],

  // --- Alpi Marittime e Liguri ---
  ['Monte Argentera', 44.1788, 7.3033, 3297, 'Alpi Marittime', 'Piemonte'],
  ['Monte Gelas', 44.1261, 7.3864, 3143, 'Alpi Marittime', 'Confine IT/FR'],
  ['Monte Clapier', 44.1164, 7.4203, 3045, 'Alpi Marittime', 'Confine IT/FR'],
  ['Bisalta', 44.2839, 7.5944, 2404, 'Alpi Marittime', 'Piemonte'],
  ['Punta Marguareis', 44.1575, 7.7075, 2651, 'Alpi Liguri', 'Confine IT/FR'],
  ['Monte Mongioie', 44.1364, 7.7911, 2630, 'Alpi Liguri', 'Piemonte'],
  ['Monte Saccarello', 44.0614, 7.7114, 2201, 'Alpi Liguri', 'Liguria'],
  ['Mont Pelat', 44.2694, 6.6975, 3050, 'Mercantour', 'Francia'],
  ['Mont Mounier', 44.1464, 6.9744, 2817, 'Mercantour', 'Francia'],
  ["Tête de l'Estrop", 44.2556, 6.4406, 2961, 'Alpi di Provenza', 'Francia'],
  ['Grand Bérard', 44.4417, 6.6069, 3048, 'Ubaye', 'Francia'],

  // --- Monte Bianco ---
  ['Monte Bianco', 45.8326, 6.8652, 4806, 'Monte Bianco', 'Confine IT/FR'],
  ['Mont Blanc du Tacul', 45.8567, 6.8878, 4248, 'Monte Bianco', 'Francia'],
  ['Dôme du Goûter', 45.8428, 6.8375, 4304, 'Monte Bianco', 'Francia'],
  ['Aiguille de Bionnassay', 45.8361, 6.8181, 4052, 'Monte Bianco', 'Confine IT/FR'],
  ['Aiguille du Midi', 45.8786, 6.8874, 3842, 'Monte Bianco', 'Francia'],
  ['Grandes Jorasses', 45.8689, 6.9876, 4208, 'Monte Bianco', 'Confine IT/FR'],
  ['Dente del Gigante', 45.8617, 6.9514, 4014, 'Monte Bianco', 'Confine IT/FR'],
  ['Aiguille Verte', 45.9344, 6.9703, 4122, 'Monte Bianco', 'Francia'],
  ['Le Brévent', 45.9342, 6.8378, 2525, 'Aiguilles Rouges', 'Francia'],
  ['Mont Buet', 46.0253, 6.8522, 3096, 'Giffre', 'Francia'],
  ['Dents du Midi', 46.1614, 6.9231, 3257, 'Chablais', 'Svizzera'],
  ['Pointe Percée', 46.0036, 6.5372, 2750, 'Aravis', 'Francia'],

  // --- Vanoise ---
  ['Grande Casse', 45.4053, 6.8286, 3855, 'Vanoise', 'Francia'],
  ['Grande Motte', 45.4264, 6.8964, 3653, 'Vanoise', 'Francia'],
  ['Mont Pourri', 45.5328, 6.8578, 3779, 'Vanoise', 'Francia'],
  ['Dent Parrachée', 45.2825, 6.7597, 3697, 'Vanoise', 'Francia'],

  // --- Écrins, Arves, Grenoble ---
  ['Barre des Écrins', 44.9222, 6.3597, 4102, 'Écrins', 'Francia'],
  ['La Meije', 45.0053, 6.3083, 3983, 'Écrins', 'Francia'],
  ['Mont Pelvoux', 44.895, 6.3667, 3943, 'Écrins', 'Francia'],
  ['Le Râteau', 45.0, 6.27, 3809, 'Écrins', 'Francia'],
  ["Aiguilles d'Arves", 45.1258, 6.3597, 3514, 'Arves', 'Francia'],
  ['Grand Pic de Belledonne', 45.175, 5.9961, 2977, 'Belledonne', 'Francia'],
  ['Taillefer', 45.0558, 5.9208, 2857, 'Taillefer', 'Francia'],
  ['Obiou', 44.7614, 5.8508, 2789, 'Dévoluy', 'Francia'],
  ['Pic de Bure', 44.6272, 5.9317, 2709, 'Dévoluy', 'Francia'],
  ['Chamechaude', 45.2878, 5.7881, 2082, 'Chartreuse', 'Francia'],
  ['Grand Veymont', 44.8694, 5.5256, 2341, 'Vercors', 'Francia'],
  ['Mont Aiguille', 44.8414, 5.5539, 2087, 'Vercors', 'Francia'],
  ['Mont Ventoux', 44.1739, 5.2786, 1909, 'Provenza', 'Francia'],
];

function slug(s: string) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

const MAJOR_HAND = new Set(['Monviso', 'Rocciamelone', 'Monte Argentera', 'Mont Ventoux', 'Mottarone', 'Bisalta', 'Monte Mucrone', 'Monte Marzo']);

/** Elenco di riserva scritto a mano (usato se la build non riesce a scaricare OSM). */
export const HAND_PEAKS: Peak[] = ROWS.map(([name, lat, lon, ele, area, region]) => ({
  id: slug(name),
  name,
  lat,
  lon,
  ele,
  area,
  region,
  source: 'base',
  major: ele >= 3500 || MAJOR_HAND.has(name),
}));

/** Cime usate dall'app: da OpenStreetMap (generate in fase di build) o, in mancanza, quelle a mano. */
export const BASE_PEAKS: Peak[] = (generated as Peak[]).length > 0 ? (generated as Peak[]) : HAND_PEAKS;

export const REGIONS = ['Piemonte', "Valle d'Aosta", 'Confine IT/FR', 'Confine IT/CH', 'Francia', 'Svizzera', 'Liguria'];

// Punto panoramico di default se il GPS non è disponibile: Monte dei Cappuccini, Torino
export const DEFAULT_VIEWPOINT = {
  lat: 45.0597,
  lon: 7.6989,
  alt: 284,
  label: 'Monte dei Cappuccini, Torino',
};
