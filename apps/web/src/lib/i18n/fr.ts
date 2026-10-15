// French translations.
//
// The key is the English source string, so only strings that differ need to be
// listed. Anything missing falls back to English. Placeholders like {name} and
// {time} must be kept exactly as they are.
export const fr: Record<string, string> = {
  // ── Visitor check-in ───────────────────────────────────────────────
  Sorry: 'Désolé',
  'See our events': 'Voir nos événements',
  'Loading…': 'Chargement…',
  'Welcome back, {name}!': 'Bon retour, {name} !',
  'Got another item to repair?': 'Un autre objet à réparer ?',
  'Add another item': 'Ajouter un autre objet',
  'See my existing items': 'Voir mes objets enregistrés',
  'Not {name}? Start fresh': "Ce n'est pas {name} ? Recommencer",
  'Welcome to {name}!': 'Bienvenue à {name} !',
  "Let's get your repair started.": 'C’est parti pour votre réparation.',
  'Check in my item': 'Enregistrer mon objet',
  'First, a little about you': 'D’abord, parlons de vous',
  'Your first name': 'Votre prénom',
  'Phone or email': 'Téléphone ou e-mail',
  '(only if you want us to contact you)': '(uniquement si vous souhaitez que nous vous contactions)',
  "I'm happy for my details to be stored for this repair session.":
    'J’accepte que mes informations soient conservées pour cette session de réparation.',
  "We only keep your name and contact if you provide it. We don't share it with anyone.":
    'Nous ne conservons votre nom et vos coordonnées que si vous nous les fournissez. Nous ne les partageons avec personne.',
  Back: 'Retour',
  Next: 'Suivant',
  'Tell us about your next item': 'Parlez-nous de votre prochain objet',
  'Now, tell us about the item': 'Parlons maintenant de l’objet',
  "Adding to {name}'s list of repairs today.": 'Ajouté à la liste de réparations de {name} aujourd’hui.',
  'What type of item is it?': 'Quel type d’objet est-ce ?',
  'Which of these is closest?': 'Lequel s’en rapproche le plus ?',
  'This helps us work out the carbon it saves. Skip it if none fit.':
    'Cela nous aide à estimer le carbone évité. Passez cette étape si aucun ne correspond.',
  'Item description': 'Description de l’objet',
  'e.g. Bosch cordless drill, blue': 'ex. : perceuse sans fil Bosch, bleue',
  'Brand (optional)': 'Marque (facultatif)',
  'Weight in kg (optional)': 'Poids en kg (facultatif)',
  'e.g. 1.5': 'ex. : 1,5',
  'This is my first visit': 'C’est ma première visite',
  "What's wrong with it?": 'Quel est le problème ?',
  "e.g. Won't turn on, battery seems dead": 'ex. : ne s’allume pas, la batterie semble morte',
  'Saving…': 'Enregistrement…',
  Continue: 'Continuer',
  'Working on it…': 'En cours…',
  "Got it, we're on it!": 'C’est noté, on s’en occupe !',
  'Your repair has been sent to our team.': 'Votre réparation a été transmise à notre équipe.',
  'Your job number': 'Votre numéro',
  'A repairer will come and find you shortly.': 'Un réparateur viendra vous trouver sous peu.',
  'Please have a seat and hold on to your item.': 'Asseyez-vous et gardez votre objet avec vous.',
  'Track your repair, live': 'Suivez votre réparation en direct',
  'Save this link. It shows the status of every item you check in today.':
    'Enregistrez ce lien : il indique l’état de chaque objet enregistré aujourd’hui.',
  'Open my tracker': 'Ouvrir mon suivi',
  'Copy link': 'Copier le lien',
  'Link copied!': 'Lien copié !',
  'Love what we do?': 'Vous aimez notre action ?',
  "Our repairs are free, but parts, tools and venue hire aren't. If you can spare a few pounds, every donation keeps us running.":
    'Nos réparations sont gratuites, mais les pièces, l’outillage et la location de la salle ne le sont pas. Chaque don nous aide à continuer.',
  'Make a donation': 'Faire un don',
  'Want to add a photo?': 'Ajouter une photo ?',
  "A photo helps our repairers see what they'll be working on while you wait.":
    'Une photo aide nos réparateurs à voir sur quoi ils vont travailler pendant que vous attendez.',
  'Photo uploaded, thanks!': 'Photo envoyée, merci !',
  Uploaded: 'Envoyée',
  'Uploading…': 'Envoi…',
  'I have another item to register': 'J’ai un autre objet à enregistrer',
  'Thank you for choosing to repair rather than replace.': 'Merci de réparer plutôt que de remplacer.',

  // ── Check-in messages (script) ─────────────────────────────────────
  'Could not load this event': 'Impossible de charger cet événement',
  'Please enter your first name': 'Merci d’indiquer votre prénom',
  'Please confirm we can store your details': 'Merci de confirmer que nous pouvons conserver vos informations',
  'Please describe your item': 'Merci de décrire votre objet',
  'Please tell us what is wrong': 'Merci d’indiquer ce qui ne va pas',
  'Could not check in': 'L’enregistrement a échoué',
  'Could not upload photo': 'L’envoi de la photo a échoué',
  "This event hasn't started yet. Doors open at {time}.": 'Cet événement n’a pas encore commencé. Ouverture à {time}.',
  'This event has now finished. See our events page for upcoming dates.':
    'Cet événement est terminé. Voir nos événements pour les prochaines dates.',
  "Unfortunately today's event has been cancelled. See our events page for future dates.":
    'L’événement d’aujourd’hui a malheureusement été annulé. Voir nos événements pour les prochaines dates.',

  // ── Visitor tracking ───────────────────────────────────────────────
  'Track my repair': 'Suivre ma réparation',
  'Could not load your tracker': 'Impossible de charger votre suivi',
  'This tracking link may be incorrect or has expired.':
    'Ce lien de suivi est peut-être incorrect ou a expiré.',
  "{name}'s repairs": 'Réparations de {name}',
  'Your repairs': 'Vos réparations',
  'Updated {time} · auto-refreshes': 'Mis à jour {time} · actualisation automatique',
  Refresh: 'Actualiser',
  'Enjoying the repair cafe?': 'Vous aimez le repair café ?',
  'A small donation helps us keep going.': 'Un petit don nous aide à continuer.',
  'Donate →': 'Faire un don →',
  'Photo of {item}': 'Photo de {item}',
  'Waiting for a repairer': 'En attente d’un réparateur',
  'Being repaired now': 'En cours de réparation',
  'Fixed!': 'Réparé !',
  "Couldn't be fixed": 'N’a pas pu être réparé',
  'Waiting for your next visit': 'En attente de votre prochaine visite',
  'Returned to you': 'Rendu',
  'just now': 'à l’instant',
  '{mins} min ago': 'il y a {mins} min',
  '{hrs} hr ago': 'il y a {hrs} h',
  '{days} day ago': 'il y a {days} jour',
  '{days} days ago': 'il y a {days} jours',
  'Checked in {time}': 'Enregistré {time}',
  'Picked up by {repairer} {time}': 'Pris en charge par {repairer} {time}',
  'a repairer': 'un réparateur',
  'Finished {time}': 'Terminé {time}',
  'by {repairer}': 'par {repairer}',
  'From your repairer:': 'Message de votre réparateur :',
  'Keep this page open while you wait. It updates automatically.':
    'Laissez cette page ouverte pendant l’attente. Elle se met à jour automatiquement.',
  'Bookmark this link to check back on your repairs later.':
    'Enregistrez ce lien pour revenir consulter vos réparations plus tard.',
};
