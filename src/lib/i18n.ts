import type { Language } from './settings';
import type { Category } from './types';

const STRINGS = {
  en: {
    lede: 'Color by number, offline.',
    tabAll: 'All',
    tabProgress: 'In progress',
    tabFinished: 'Finished',
    all: 'All',
    favorites: 'Favorites',
    mystery: 'Mystery',
    mysteryPicture: 'Mystery picture',
    emptyFavorites: 'No favorites yet. Tap the heart on a picture.',
    emptyProgress: 'Nothing in progress. Open a picture and tap a color.',
    emptyDone: 'Finished pictures will wait here.',
    emptyShelf: 'No pictures on this shelf.',
    moreAnimals: 'More animals',
    easy: 'easy',
    medium: 'medium',
    hard: 'hard',
    settings: 'Settings',
    justThisDevice: 'Just this device.',
    numberStyle: 'Number style',
    practice: 'Practice',
    add10: 'To 10',
    add20: 'To 20',
    times5: '5×5',
    times10: '10×10',
    labels: 'Labels',
    language: 'Language',
    plain: 'Plain',
    counting: 'Counting',
    adding: 'Adding',
    subtracting: 'Subtracting',
    times: 'Times',
    numbers: 'Numbers',
    colors: 'Colors',
    words: 'Words',
    english: 'English',
    espanol: 'Español',
    bigNumbers: 'Big numbers',
    bigNumbersHint: 'Easier to read when you zoom out',
    sound: 'Effects',
    soundHint: 'Pops and chimes while you color',
    music: 'Music',
    musicHint: 'A quiet loop. Off until you turn it on.',
    volume: 'Volume',
    musicVolume: 'Music volume',
    haptics: 'Haptics',
    hapticsHint: 'A tiny tick when a spot fills',
    shareFavorites: 'Share favorites',
    exportBackup: 'Export backup',
    importBackup: 'Import backup',
    resetProgress: 'Reset progress',
    eraseQuestion: 'Erase every saved picture on this device?',
    erase: 'Erase',
    cancel: 'Cancel',
    favoritesShared: 'Favorites shared.',
    favoritesCopied: 'Favorites copied.',
    backupDownloaded: 'Backup downloaded.',
    backupImported: 'Backup imported.',
    progressCleared: 'Progress cleared on this device.',
    importFailed: 'Could not import that file.',
    backupNote: 'iOS can clear saved pictures if the app sits unused. Export a backup when you want a copy you can bring back.',
    back: 'Back',
    hint: 'Hint',
    undo: 'Undo',
    finished: 'Finished',
    beauty: "That's a beauty.",
    everySpot: 'Every spot in {title} is filled.',
    mysteryReveal: 'The mystery picture is {title}.',
    replay: 'Replay',
    favorite: 'Favorite',
    favorited: 'Favorited',
    saveImage: 'Save image',
    backToShelf: 'Back to the shelf',
    missing: 'That picture is missing.',
    palette: 'Colors',
    readFacts: 'Read the facts',
    listen: 'Listen',
    addFavorite: 'Add to favorites',
    removeFavorite: 'Remove from favorites',
    saveError: "Couldn't save on this device. Export a backup from Settings.",
    openSettings: 'Settings',
    allGames: 'All games',
    howToColor: 'How should we color?',
    modeNormal: 'Normal',
    modeMath: 'Math',
    modeEspanol: 'Español',
    modeNormalNote: 'Plain numbers.',
    modeMathNote: 'Problems at your practice setting:',
    modeEspanolNote: 'Spanish color names. Tap a color to hear it.',
    start: 'Start',
    forParents: 'For parents',
    picturePacksHint: 'A pack stays on this device. It is not part of the public book.',
    addPack: 'Add picture pack',
    removePack: 'Remove',
    packAdded: 'Picture pack added.',
    packRemoved: 'Picture pack removed.',
    noPacks: 'No picture packs on this device.',
  },
  es: {
    lede: 'Colorea por números, sin internet.',
    tabAll: 'Todo',
    tabProgress: 'En curso',
    tabFinished: 'Listo',
    all: 'Todo',
    favorites: 'Favoritos',
    mystery: 'Misterio',
    mysteryPicture: 'Dibujo misterioso',
    emptyFavorites: 'Aún no hay favoritos. Toca el corazón de un dibujo.',
    emptyProgress: 'Nada en curso. Abre un dibujo y toca un color.',
    emptyDone: 'Los dibujos terminados esperarán aquí.',
    emptyShelf: 'No hay dibujos en esta estantería.',
    moreAnimals: 'Más animales',
    easy: 'fácil',
    medium: 'medio',
    hard: 'difícil',
    settings: 'Ajustes',
    justThisDevice: 'Solo en este aparato.',
    numberStyle: 'Estilo de números',
    practice: 'Práctica',
    add10: 'Hasta 10',
    add20: 'Hasta 20',
    times5: '5×5',
    times10: '10×10',
    labels: 'Rótulos',
    language: 'Idioma',
    plain: 'Simple',
    counting: 'Contar',
    adding: 'Sumar',
    subtracting: 'Restar',
    times: 'Tablas',
    numbers: 'Números',
    colors: 'Colores',
    words: 'Palabras',
    english: 'English',
    espanol: 'Español',
    bigNumbers: 'Números grandes',
    bigNumbersHint: 'Más fáciles de ver de lejos',
    sound: 'Efectos',
    soundHint: 'Toques y campanas al pintar',
    music: 'Música',
    musicHint: 'Una melodía suave. Apagada hasta que la enciendas.',
    volume: 'Volumen',
    musicVolume: 'Volumen de la música',
    haptics: 'Vibración',
    hapticsHint: 'Un toque corto al pintar',
    shareFavorites: 'Compartir favoritos',
    exportBackup: 'Exportar copia',
    importBackup: 'Importar copia',
    resetProgress: 'Borrar progreso',
    eraseQuestion: '¿Borrar todos los dibujos guardados en este aparato?',
    erase: 'Borrar',
    cancel: 'Cancelar',
    favoritesShared: 'Favoritos compartidos.',
    favoritesCopied: 'Favoritos copiados.',
    backupDownloaded: 'Copia descargada.',
    backupImported: 'Copia importada.',
    progressCleared: 'Progreso borrado en este aparato.',
    importFailed: 'No se pudo importar ese archivo.',
    backupNote: 'iOS puede borrar los dibujos si la app no se usa. Exporta una copia cuando quieras guardarla.',
    back: 'Volver',
    hint: 'Pista',
    undo: 'Deshacer',
    finished: 'Listo',
    beauty: 'Qué bonito.',
    everySpot: 'Cada espacio de {title} está pintado.',
    mysteryReveal: 'El dibujo misterioso es {title}.',
    replay: 'Otra vez',
    favorite: 'Favorito',
    favorited: 'En favoritos',
    saveImage: 'Guardar imagen',
    backToShelf: 'Volver a la estantería',
    missing: 'Ese dibujo no está.',
    palette: 'Colores',
    readFacts: 'Leer los datos',
    listen: 'Escuchar',
    addFavorite: 'Añadir a favoritos',
    removeFavorite: 'Quitar de favoritos',
    saveError: 'No se pudo guardar en este aparato. Exporta una copia desde Ajustes.',
    openSettings: 'Ajustes',
    allGames: 'Todos los juegos',
    howToColor: '¿Cómo coloreamos?',
    modeNormal: 'Normal',
    modeMath: 'Sumas',
    modeEspanol: 'Español',
    modeNormalNote: 'Números simples.',
    modeMathNote: 'Cuentas con tu nivel de práctica:',
    modeEspanolNote: 'Nombres de colores en español. Toca un color para oírlo.',
    start: 'Empezar',
    forParents: 'Para padres',
    picturePacksHint: 'Un paquete se queda en este aparato. No forma parte del libro público.',
    addPack: 'Añadir paquete de dibujos',
    removePack: 'Quitar',
    packAdded: 'Paquete añadido.',
    packRemoved: 'Paquete quitado.',
    noPacks: 'No hay paquetes en este aparato.',
  },
} as const;

export type CopyKey = keyof typeof STRINGS.en;

const CATEGORY_NAMES: Record<Language, Record<Category, string>> = {
  en: {
    Thanksgiving: 'Thanksgiving',
    Christmas: 'Christmas',
    Animals: 'Animals',
    Flowers: 'Flowers',
    Food: 'Food',
    Fantasy: 'Fantasy',
    Patterns: 'Patterns',
    Science: 'Science',
    'Grown-ups': 'For Grown-ups',
  },
  es: {
    Thanksgiving: 'Acción de Gracias',
    Christmas: 'Navidad',
    Animals: 'Animales',
    Flowers: 'Flores',
    Food: 'Comida',
    Fantasy: 'Fantasía',
    Patterns: 'Patrones',
    Science: 'Ciencia',
    'Grown-ups': 'Para adultos',
  },
};

export function t(language: Language, key: CopyKey): string {
  return STRINGS[language][key];
}

export function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? '');
}

export function categoryLabel(language: Language, category: Category): string {
  return CATEGORY_NAMES[language][category];
}

export const ANIMAL_HABITATS = ['sea-life', 'safari', 'jungle', 'realistic'] as const;
export type AnimalHabitat = (typeof ANIMAL_HABITATS)[number];

const HABITAT_NAMES: Record<Language, Record<AnimalHabitat, string>> = {
  en: { 'sea-life': 'Sea Life', safari: 'Safari', jungle: 'Jungle', realistic: 'Realistic Animals' },
  es: { 'sea-life': 'Vida marina', safari: 'Safari', jungle: 'Selva', realistic: 'Animales realistas' },
};

export function habitatLabel(language: Language, habitat: AnimalHabitat): string {
  return HABITAT_NAMES[language][habitat];
}

export const REALISTIC_GROUPS = ['big-cats', 'sharks', 'reptiles', 'amphibians'] as const;
export type RealisticGroup = (typeof REALISTIC_GROUPS)[number];

const REALISTIC_GROUP_NAMES: Record<Language, Record<RealisticGroup, string>> = {
  en: { 'big-cats': 'Big Cats', sharks: 'Sharks', reptiles: 'Reptiles', amphibians: 'Amphibians' },
  es: { 'big-cats': 'Grandes felinos', sharks: 'Tiburones', reptiles: 'Reptiles', amphibians: 'Anfibios' },
};

export function realisticGroupLabel(language: Language, group: RealisticGroup): string {
  return REALISTIC_GROUP_NAMES[language][group];
}

export const GROWNUP_GROUPS = ['abstract', 'mandala', 'floral', 'places'] as const;
export type GrownupGroup = (typeof GROWNUP_GROUPS)[number];

const GROWNUP_GROUP_NAMES: Record<Language, Record<GrownupGroup, string>> = {
  en: { abstract: 'Abstract', mandala: 'Mandala', floral: 'Floral', places: 'Places' },
  es: { abstract: 'Abstracto', mandala: 'Mandala', floral: 'Floral', places: 'Lugares' },
};

export function grownupGroupLabel(language: Language, group: GrownupGroup): string {
  return GROWNUP_GROUP_NAMES[language][group];
}
