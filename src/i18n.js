// -----------------------------------------------------------------------------
// The texts shown to the user, in English and French.
// -----------------------------------------------------------------------------

/** The text of one language, English when missing. */
export const word = (text, language) => text?.[language] ?? text?.en ?? '';

export const FEATURE_NAMES = {
  lock: { en: 'Lock', fr: 'Verrou' },
  state: { en: 'Lock state', fr: 'État de la serrure' },
  status: { en: 'Status', fr: 'Statut' },
  pull: { en: 'Open the door (pull spring)', fr: 'Ouvrir la porte (pull spring)' },
  door: { en: 'Door', fr: 'Porte' },
  battery: { en: 'Battery', fr: 'Batterie' },
  charging: { en: 'Charging', fr: 'En charge' },
};

export const TYPE_NAMES = {
  lock: { en: 'Tedee lock', fr: 'Serrure Tedee' },
  keypad: { en: 'Tedee keypad', fr: 'Clavier Tedee' },
};

/** The detailed status of a lock (text feature). */
export const STATUS = {
  locked: { en: 'Locked', fr: 'Verrouillée' },
  unlocked: { en: 'Unlocked', fr: 'Déverrouillée' },
  half_open: { en: 'Half-locked', fr: 'Semi-verrouillée' },
  pulled: { en: 'Latch pulled', fr: 'Pêne tiré' },
  locking: { en: 'Locking…', fr: 'Verrouillage…' },
  unlocking: { en: 'Unlocking…', fr: 'Déverrouillage…' },
  pulling: { en: 'Pulling the latch…', fr: 'Ouverture du pêne…' },
  calibrating: { en: 'Calibrating…', fr: 'Calibrage…' },
  uncalibrated: { en: 'Not calibrated', fr: 'Non calibrée' },
  updating: { en: 'Updating…', fr: 'Mise à jour…' },
  jammed: { en: 'Jammed', fr: 'Bloquée' },
  disconnected: { en: 'Not connected to the bridge', fr: 'Non connectée au bridge' },
  unknown: { en: 'Unknown', fr: 'Inconnu' },
};

const plural = (n, en, fr) => ({
  en: `${n} ${en}${n === 1 ? '' : 's'}`,
  fr: `${n} ${fr}${n === 1 ? '' : 's'}`,
});

/** A duration in words, e.g. "5 min" / "2 h". */
export function age(ms) {
  if (ms < 60_000) {
    return `${Math.max(1, Math.round(ms / 1000))} s`;
  }
  if (ms < 3_600_000) {
    return `${Math.round(ms / 60_000)} min`;
  }
  return `${Math.round(ms / 3_600_000)} h`;
}

export const T = {
  noConfig: {
    en: 'Enter the IP address of the Tedee Bridge and its API token (Tedee app > Bridge > Local API).',
    fr: "Saisissez l'adresse IP du Tedee Bridge et son jeton d'API (application Tedee > Bridge > API locale).",
  },
  badHost: {
    en: 'The bridge address is not valid: enter an IP address or a host name, e.g. 192.168.1.50.',
    fr: "L'adresse du bridge n'est pas valide : saisissez une adresse IP ou un nom d'hôte, par exemple 192.168.1.50.",
  },
  connecting: {
    en: 'Connecting to the Tedee Bridge…',
    fr: 'Connexion au Tedee Bridge…',
  },
  connected: (bridge, locks, keypads) => {
    const l = plural(locks, 'lock', 'serrure');
    const k = keypads > 0 ? plural(keypads, 'keypad', 'clavier') : undefined;
    return {
      en: `Bridge ${bridge}: ${l.en}${k ? `, ${k.en}` : ''}.`,
      fr: `Bridge ${bridge} : ${l.fr}${k ? `, ${k.fr}` : ''}.`,
    };
  },
  refused: (wait) => ({
    en: `The bridge refused the API token. Check the token and the mode (hashed or plain) in the Tedee app; in hashed mode, also check the clock of the Gladys host (the token carries the time). Next try in ${wait}.`,
    fr: `Le bridge a refusé le jeton d'API. Vérifiez le jeton et le mode (haché ou simple) dans l'application Tedee ; en mode haché, vérifiez aussi l'horloge de la machine Gladys (le jeton contient l'heure). Prochain essai dans ${wait}.`,
  }),
  unreachable: (reason, wait) => ({
    en: `Tedee Bridge unreachable (${reason}). Next try in ${wait}.`,
    fr: `Tedee Bridge injoignable (${reason}). Prochain essai dans ${wait}.`,
  }),
  rateLimited: (wait) => ({
    en: `The bridge asks to slow down: paused for ${wait}.`,
    fr: `Le bridge demande de ralentir : pause de ${wait}.`,
  }),
  lockOffline: {
    en: 'The lock is not connected to the bridge.',
    fr: "La serrure n'est pas connectée au bridge.",
  },
  testCooldown: {
    en: 'Already tested a few seconds ago.',
    fr: 'Déjà testé il y a quelques secondes.',
  },
  denied: {
    unlock: {
      en: 'Unlocking from Gladys is off: allow it in the configuration of the Tedee integration.',
      fr: "Le déverrouillage depuis Gladys est désactivé : autorisez-le dans la configuration de l'intégration Tedee.",
    },
    pull: {
      en: 'Opening the door from Gladys is off: it needs both the unlocking and the opening options in the configuration of the Tedee integration.',
      fr: "L'ouverture de la porte depuis Gladys est désactivée : elle demande les deux options, déverrouillage et ouverture, dans la configuration de l'intégration Tedee.",
    },
    autoPull: {
      en: 'Unlocking refused: the automatic pull spring is on for this lock in the Tedee app, so unlocking would also open the door. Allow opening the door in the configuration, or turn the automatic pull spring off.',
      fr: "Déverrouillage refusé : le pull spring automatique est activé pour cette serrure dans l'application Tedee, déverrouiller ouvrirait donc aussi la porte. Autorisez l'ouverture de la porte dans la configuration, ou désactivez le pull spring automatique.",
    },
    inProgress: {
      en: 'Command refused: a movement is in progress after the previous command.',
      fr: 'Commande refusée : un mouvement est en cours après la commande précédente.',
    },
    pullSpring: {
      en: 'The pull spring is off for this lock in the Tedee app.',
      fr: "Le pull spring est désactivé pour cette serrure dans l'application Tedee.",
    },
    late: {
      en: 'Command refused: it arrived too late to be sent safely. Try again.',
      fr: 'Commande refusée : arrivée trop tard pour être envoyée sans risque. Réessayez.',
    },
    offline: {
      en: 'Command refused: the lock is not connected to the bridge.',
      fr: "Commande refusée : la serrure n'est pas connectée au bridge.",
    },
    moving: {
      en: 'Command refused: the lock is moving.',
      fr: 'Commande refusée : la serrure est en mouvement.',
    },
    unknown: {
      en: 'Command refused: the state of the lock is unknown (not calibrated, updating or unreadable).',
      fr: "Commande refusée : l'état de la serrure est inconnu (non calibrée, en mise à jour ou illisible).",
    },
    unreadable: {
      en: 'Command refused: the state of the lock could not be read just before acting.',
      fr: "Commande refusée : l'état de la serrure n'a pas pu être relu juste avant d'agir.",
    },
    paused: {
      en: 'Command refused: the bridge asked to slow down, try again later.',
      fr: 'Commande refusée : le bridge a demandé de ralentir, réessayez plus tard.',
    },
    noConfig: {
      en: 'Command refused: the integration is not configured.',
      fr: "Commande refusée : l'intégration n'est pas configurée.",
    },
    unknownDevice: {
      en: 'Command refused: unknown lock, wait for the first reading of the bridge.',
      fr: 'Commande refusée : serrure inconnue, attendez la première lecture du bridge.',
    },
  },
  sentNoAnswer: {
    en: 'The bridge did not confirm the command in time: the lock may still move. Check its state.',
    fr: "Le bridge n'a pas confirmé la commande à temps : la serrure peut quand même bouger. Vérifiez son état.",
  },
  commandFailed: (reason) => ({
    en: `The bridge refused the command (${reason}).`,
    fr: `Le bridge a refusé la commande (${reason}).`,
  }),
  lockDisconnected: {
    en: 'The bridge says the lock is not connected (HTTP 405): command not sent.',
    fr: "Le bridge indique que la serrure n'est pas connectée (HTTP 405) : commande non envoyée.",
  },
  bleError: {
    en: 'Bluetooth error between the bridge and the lock (HTTP 406): command not executed. Try again.',
    fr: 'Erreur Bluetooth entre le bridge et la serrure (HTTP 406) : commande non exécutée. Réessayez.',
  },
  unlockModeRefused: {
    en: 'The bridge refused the unlock mode (HTTP 403): the lock did not unlock.',
    fr: "Le bridge a refusé le mode de déverrouillage (HTTP 403) : la serrure ne s'est pas déverrouillée.",
  },
  // A 403 on a read: not documented for the reads, the token mode is the likely cause.
  badMode: (wait) => ({
    en: `The bridge answered HTTP 403: probably a token mode that does not match the "Encrypted token" switch of the Tedee app (on = Hashed, off = Plain). Next try in ${wait}.`,
    fr: `Le bridge a répondu HTTP 403 : probablement un mode de jeton qui ne correspond pas à l'interrupteur « Encrypted token » de l'application Tedee (activé = Haché, désactivé = Simple). Prochain essai dans ${wait}.`,
  }),
};
