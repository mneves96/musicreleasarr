# MusicReleasarr

Suivi d'artistes, detection de nouvelles sorties, telechargement automatique via MeTube et notifications, integre a la stack Navidrome/Picard/MeTube.

## Fonctionnement en bref

- **MusicBrainz** est la source de verite pour savoir quelles releases existent (albums/EP/singles/compilations) et leur date de sortie.
- **Deezer** et **Last.fm** enrichissent les covers et l'image de l'artiste.
- **Navidrome** (via son API Subsonic) est interroge pour savoir si une release est deja dans ta bibliotheque.
- **YouTube Music** (recherche non-officielle via `ytmusicapi`) permet de retrouver le lien a passer a **MeTube** pour telecharger une release manquante.
- Tout est stocke dans une base SQLite locale (`/data/app.db`), pas de service externe a heberger.

Un scan complet tourne selon la planification definie dans Reglages (par defaut tous les jours a 6h), et une verification plus frequente (toutes les heures) permet de detecter quand un telechargement lance est termine et bien indexe par Navidrome.

## Premiers pas

1. Demarre le service : `docker compose up -d --build releases`
2. Ouvre `http://<ton-nas>:${RELEASES_PORT}` (port defini dans `.env`, `8090` par defaut)
3. Va dans **Reglages** et renseigne :
   - **MeTube** : l'URL interne du conteneur, ex. `http://metube:8081`
   - **Navidrome** : URL, utilisateur et mot de passe (utilise un compte Navidrome dedie si possible)
   - **Last.fm** : tu peux reutiliser la meme cle API que celle deja configuree pour Navidrome
   - **Email** et/ou **Pushbullet** si tu veux des notifications (voir ci-dessous)
   - Utilise les boutons "Tester la connexion" pour verifier chaque integration
4. Utilise la barre de recherche en haut pour trouver un artiste et le suivre
5. Sur la page de l'artiste, choisis les types de sortie a suivre et si tu veux le telechargement automatique
6. Le calendrier et la liste des artistes suivis se remplissent au fil des scans (ou lance un scan immediat depuis Reglages)

## Configurer Pushbullet

1. Cree un compte sur [pushbullet.com](https://www.pushbullet.com/) et installe l'app mobile si tu veux recevoir les notifications sur ton telephone
2. Va dans **Settings > Account** sur le site Pushbullet et genere un **Access Token**
3. Colle ce token dans Reglages > Notifications Pushbullet, puis active la case et teste

## Configurer l'email (exemple avec Gmail)

1. Active la validation en 2 etapes sur ton compte Google
2. Cree un **mot de passe d'application** (Compte Google > Securite > Mots de passe des applications)
3. Renseigne dans Reglages : serveur `smtp.gmail.com`, port `587`, ton adresse Gmail comme utilisateur, le mot de passe d'application genere, et l'adresse d'envoi/destination

## Limites connues

- La recherche/le telechargement YouTube Music repose sur `ytmusicapi`, une librairie non-officielle qui peut casser si Google modifie son frontend. En cas d'echec de recherche, le telechargement manuel piste par piste depuis la page artiste reste possible en reessayant plus tard.
- Spotify n'est pas integre en v1 (les champs existent en base pour une evolution future), les liens/covers Spotify ne sont donc pas affiches.
- MusicBrainz applique une limite de 1 requete/seconde ; le premier scan d'un artiste avec un tres gros catalogue peut prendre plusieurs dizaines de secondes.
