// Exercices aux poulies et aux machines qu'on voit dans les salles d'aujourd'hui, mais qui manquent dans la
// Free Exercise DB. Rédigés à la main. Il n'existe pas de photo libre de droits pour eux : on montre celle
// d'un mouvement semblable (photo = identifiant d'un exercice de la base), et la fiche le précise.
// Format : [identifiant, nom, muscle principal, matériel, repères, photo semblable, consigne]
//   repères : l = jambes · c = polyarticulaire · i = isolation
export const EXTRA = [
  // --- Poulies ---
  ['x_cable_lat_standing', 'Élévation latérale un bras à la poulie (debout)', 'épaules', 'poulie', 'i', 'Cable_Seated_Lateral_Raise', 'De côté à la poulie basse, poignée dans la main la plus loin, monte le bras sur le côté jusqu’à l’épaule, puis redescends lentement.'],
  ['x_cable_y_raise', 'Élévation en Y à la poulie', 'épaules', 'poulie', 'i', 'Cable_Rear_Delt_Fly', 'Face aux deux poulies basses, câbles croisés, monte les bras en diagonale pour former un Y au-dessus de la tête, pouces vers le haut.'],
  ['x_cable_reverse_fly', 'Oiseau croisé à la poulie haute', 'épaules', 'poulie', 'i', 'Cable_Rear_Delt_Fly', 'Face aux poulies hautes, câbles croisés devant toi, ouvre les bras vers l’arrière à hauteur des épaules en serrant l’arrière des épaules.'],
  ['x_bayesian_curl', 'Curl bayésien (dos à la poulie)', 'biceps', 'poulie', 'i', 'Standing_Biceps_Cable_Curl', 'Dos à la poulie basse, un pas en avant, bras tiré vers l’arrière : monte la poignée en gardant le coude derrière le corps, puis redescends lentement.'],
  ['x_cable_curl_bar', 'Curl à la poulie basse, barre droite', 'biceps', 'poulie', 'i', 'Standing_Biceps_Cable_Curl', 'Face à la poulie basse, coudes collés au corps, monte la barre vers les épaules et redescends sans balancer.'],
  ['x_cable_kickback_tri', 'Kickback triceps à la poulie', 'triceps', 'poulie', 'i', 'Tricep_Dumbbell_Kickback', 'Penché vers l’avant, coude collé au corps, tends le bras vers l’arrière jusqu’à l’extension complète, puis reviens lentement.'],
  ['x_cross_tri_ext', 'Extension triceps croisée aux poulies hautes', 'triceps', 'poulie', 'i', 'Triceps_Pushdown', 'Entre deux poulies hautes, câbles croisés, pousse les mains vers le bas et vers l’extérieur, coudes fixes.'],
  ['x_cable_pullover', 'Pull-over à la poulie haute (corde)', 'dorsaux', 'poulie', 'i', 'Rope_Straight-Arm_Pulldown', 'Penché légèrement vers l’avant, bras presque tendus, ramène la corde jusqu’aux cuisses en serrant les dorsaux, puis remonte lentement.'],
  ['x_cable_row_wide', 'Rowing assis prise large à la poulie', 'milieu du dos', 'poulie', 'c', 'Seated_Cable_Rows', 'Barre large, dos droit, tire vers le bas de la poitrine en écartant les coudes et en serrant les omoplates.'],
  ['x_cable_row_standing', 'Rowing un bras debout à la poulie', 'dorsaux', 'poulie', 'c', 'Seated_Cable_Rows', 'Debout face à la poulie à mi-hauteur, tire la poignée vers la hanche en gardant le buste immobile, puis tends le bras.'],
  ['x_half_kneel_pd', 'Tirage un bras à genoux à la poulie haute', 'dorsaux', 'poulie', 'c', 'One_Arm_Lat_Pulldown', 'Un genou au sol sous la poulie haute, tire la poignée vers la hanche en abaissant le coude, puis remonte lentement.'],
  ['x_low_high_fly', 'Écarté de bas en haut à la poulie', 'pectoraux', 'poulie', 'i', 'Low_Cable_Crossover', 'Poulies basses, bras légèrement pliés, monte les mains devant toi jusqu’à hauteur du menton en serrant le haut des pectoraux.'],
  ['x_high_low_fly', 'Écarté de haut en bas à la poulie', 'pectoraux', 'poulie', 'i', 'Cable_Crossover', 'Poulies hautes, un pas en avant, descends les mains devant les hanches en serrant les pectoraux, puis reviens lentement.'],
  ['x_cable_hip_abd', 'Abduction de hanche debout à la poulie', 'abducteurs', 'poulie', 'li', 'Cable_Hip_Adduction', 'Sangle à la cheville la plus loin de la poulie basse, écarte la jambe sur le côté sans pencher le buste, puis reviens lentement.'],
  ['x_cable_leg_curl', 'Curl jambe debout à la poulie', 'ischios', 'poulie', 'li', 'Standing_Leg_Curl', 'Face à la poulie basse, sangle à la cheville, ramène le talon vers la fesse en gardant le genou fixe.'],
  ['x_cable_squat', 'Squat à la poulie basse', 'quadriceps', 'poulie', 'lc', 'Goblet_Squat', 'Poignée contre la poitrine, face à la poulie basse, descends jusqu’aux cuisses parallèles en gardant le buste droit, puis remonte.'],
  ['x_cable_rdl', 'Soulevé de terre roumain à la poulie basse', 'ischios', 'poulie', 'lc', 'Cable_Deadlifts', 'Face à la poulie basse, jambes presque tendues, pousse les hanches vers l’arrière, dos plat, puis remonte en serrant les fessiers.'],
  // --- Machines ---
  ['x_mach_lat_pd', 'Tirage vertical à la machine (convergent)', 'dorsaux', 'machine', 'c', 'Wide-Grip_Lat_Pulldown', 'Cuisses calées, tire les poignées vers le haut de la poitrine en abaissant les coudes, puis remonte lentement.'],
  ['x_mach_row', 'Rowing assis à la machine (appui poitrine)', 'milieu du dos', 'machine', 'c', 'Leverage_Iso_Row', 'Poitrine contre l’appui, tire les poignées vers toi en serrant les omoplates, puis tends les bras lentement.'],
  ['x_mach_pullover', 'Pull-over à la machine', 'dorsaux', 'machine', 'i', 'Straight-Arm_Dumbbell_Pullover', 'Coudes contre les appuis, ramène les bras de derrière la tête jusqu’au ventre en serrant les dorsaux.'],
  ['x_mach_lateral', 'Élévations latérales à la machine', 'épaules', 'machine', 'i', 'Side_Lateral_Raise', 'Assis, bras contre les appuis, monte les coudes sur les côtés jusqu’aux épaules, puis redescends lentement.'],
  ['x_mach_hip_thrust', 'Hip thrust à la machine', 'fessiers', 'machine', 'lc', 'Barbell_Hip_Thrust', 'Dos contre l’appui, ceinture sur les hanches, monte le bassin jusqu’à l’alignement épaules-hanches-genoux, serre les fessiers.'],
  ['x_mach_glute_kick', 'Kickback fessier à la machine', 'fessiers', 'machine', 'li', 'Glute_Kickback', 'Buste appuyé, pousse la plateforme vers l’arrière avec le talon en serrant la fesse, sans cambrer le bas du dos.'],
  ['x_pendulum', 'Squat pendule', 'quadriceps', 'machine', 'lc', 'Hack_Squat', 'Épaules sous les appuis, descends le plus bas possible en gardant le dos collé, puis pousse dans toute la plante des pieds.'],
  ['x_belt_squat', 'Squat à la ceinture (belt squat)', 'quadriceps', 'machine', 'lc', 'Barbell_Squat', 'Ceinture aux hanches, descends jusqu’aux cuisses parallèles en gardant le buste droit ; aucune charge sur le dos.'],
  ['x_seated_legpress', 'Presse à cuisses assise (horizontale)', 'quadriceps', 'machine', 'lc', 'Leg_Press', 'Dos collé au dossier, plie les genoux vers la poitrine, puis pousse la plateforme sans verrouiller les genoux.'],
  ['x_single_legpress', 'Presse à cuisses une jambe', 'quadriceps', 'machine', 'lc', 'Leg_Press', 'Un pied au centre de la plateforme, descends en contrôlant sans décoller le bassin, puis pousse ; change de jambe.'],
  ['x_mach_back_ext', 'Extension lombaire à la machine', 'lombaires', 'machine', 'i', 'Hyperextensions_Back_Extensions', 'Assis, dos contre l’appui, pousse vers l’arrière en gardant le dos droit, puis reviens lentement.'],
];
