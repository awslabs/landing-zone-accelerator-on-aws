# Landing Zone Accelerator pour le secteur de l'éducation primaire et collégial au Québec

## Survol

**Le déploiement Landing Zone Accelerator (LZA)** pour le secteur de l'éducation primaire et collégial au Québec est un déploiement spécifique du [Landing Zone Accelerator sur AWS](https://aws.amazon.com/solutions/implementations/landing-zone-accelerator-on-aws/) architecturé pour s'aligner avec les meilleures pratiques AWS en conformité avec les requis et bonnes pratiques qui s'appliquent à ce secteur. Construit par dessus le déploiement standard AWS Control Tower, notamment les comptes `Management`, `Audit`, et `LogArchive`, la LZA pour le secteur de l'éducation primaire et collégial au Québec déploie des ressources supplémentaires pour aider à établir une plateforme prête à l'emploi, avec des capacités de sécurité, de conformité, et de gestion operationnelle. La Landing Zone Accelerator ne rend pas, par elle même, les charges de travail conformes. Elle établit uniquement les fondements nécessaires pour arriver à cette conformité. Vous devez réviser, évaluer, valider, et approuver chaque solution déployée afin de confirmer son état de conformité en fonction des configurations de sécurité, et de leur adéquation par rapport à vos exigences.

## Survol du déploiement

Suivez les étapes ci-dessous pour déployer la Landing Zone Accelerator pour le secteur l'éducation primaire et collégial au Québec.

[Étape 1. Lancer la pile](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/step-1.-launch-the-stack.html)

* Lancer le modèle AWS CloudFormation dans votre compte AWS.
* Réviser les paramètres du modèle et ajuster les valeurs par défaut selon vos besoins.

[Étape 2. Attendre la finalisation du déploiement initial](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/step-2.-await-initial-environment-deployment.html)

* Attendre la fin de l'exécution du pipeline `AWSAccelerator-Pipeline`.

Étape 3. Copier les fichiers de configuration

* Clôner le référentiel AWS CodeCommit `aws-accelerator-config`.
* Clôner le référentiel [landing-zone-accelerator-on-aws](https://github.com/awslabs/landing-zone-accelerator-on-aws).
* Copier tout le contenu du dossier `aws-best-practices` sous `reference/sample-configurations` vers votre référentiel local `aws-accelerator-config`.
* Copier tout le contenu du dossier `aws-best-practices-education-quebec-K12` sous `reference/sample-configurations` vers votre référentiel local `aws-accelerator-config`.  Écraser les fichiers existants lors de cette copie.

Étape 4. Ajuster les les fichiers de configuration et déployer le changement

* En utilisant votre environnement de développemenr, ajuster le paramètre `homeRegion` au début de chaque fichier de configuration pour cibler la région `ca-central-1`.
* Ajuter les fichiers de configuration selon les besoins de votre environnement. Rechercher les commentaires indiqués `UPDATE` pour retrouver rapidement les endroits où des changements sont requis
* Réviser le contenu de la section `Contrôles de sécurité` ci-dessous pour bien comprendre les contrôles spécifiques activés pour vous.
* Faire un `commit` des fichiers de configuration, puis pousser les changements dans le référentiel AWS CodeCommit `aws-accelerator-config`.
* Réaliser un déploiement en déclenchant manuellement le pipeline `AWSAccelerator-Pipeline`.

## Requis de sécurité

| Catégorie | Requis | Contrôle établi |
| --------------------|--------------|
| 1. Protéger les comptes racines | 1. Implémenter l’authentification multifacteur (MFA) | MFA au niveau du compte de gestion : à activer au démarrage de l'organisation. MFA au niveau des utilisateurs IAM dans le compte de gestion : à activer à chaque création d'utilisateur. MFA au niveau SSO : à activer au niveau du fournisseur d'identité utilisé. |
| 1. Protéger les comptes racines | 2. Supprimer les clés d’accès du compte racine | Une SCP bloque l'utilisation des utilisateurs racine dans tous les comptes de l'organisation. (Voir QC-2-BloquerUtilisationUtilisateurRacine dans service-control-policies/scp-education-quebec.json) |
| 1. Protéger les comptes racines | 3. Définir des comptes d’accès urgent ou « brise-glace » | Comptes brise-glace définis par la LZA dans aws-best-practices/iam-config.yaml |
| 1. Protéger les comptes racines | 4. Implémenter un processus pour l’utilisation des comptes racines et d’accès urgent | TODO |
| 2. Gérer les comptes ayant le privilège administrateur | 5. Documenter un processus de gestion des comptes avec le privilège administrateur | TODO |
| 2. Gérer les comptes ayant le privilège administrateur | 6. Implémenter un mécanisme d'application des autorisations d'accès | TODO |
| 2. Gérer les comptes ayant le privilège administrateur | 7. Implémenter un mécanisme pour identifier et authentifier de manière unique les utilisateurs | Utilisation SSO |
| 2. Gérer les comptes ayant le privilège administrateur | 8. Implémenter l’authentification multifacteur pour les comptes ayant le privilège administrateur et les interfaces exposées à un réseau externe | MFA au niveau du compte de gestion : à activer au démarrage de l'organisation. MFA au niveau des utilisateurs IAM dans le compte de gestion : à activer à chaque création d'utilisateur. MFA au niveau SSO : à activer au niveau du fournisseur d'identité utilisé. |
| 2. Gérer les comptes ayant le privilège administrateur | 9. Changer les mots de passe par défaut | Il n'y a pas de mots de passe par défaut |
| 2. Gérer les comptes ayant le privilège administrateur | 10. Configurer la politique de mot de passe conformément aux directives sur les mots de passe de l’organisation | Politique de mots de passe définie dans security-config.yaml |
| 2. Gérer les comptes ayant le privilège administrateur | 11. Identifier les restrictions d'accès et les exigences de configuration pour les terminaux émis par l’organisme | TODO |
| 3. Limiter les accès à la console du nuage | 12. Implémenter l’authentification multifacteur (MFA) pour les comptes à privilège élevé et les accès distants au nuage | MFA au niveau du compte de gestion : à activer au démarrage de l'organisation. MFA au niveau des utilisateurs IAM dans le compte de gestion : à activer à chaque création d'utilisateur. MFA au niveau SSO : à activer au niveau du fournisseur d'identité utilisé. |
| 3. Limiter les accès à la console du nuage | 13. Déterminer et configurer les restrictions d’accès pour la connexion des utilisateurs et des appareils à la console du nuage | TODO |
| 3. Limiter les accès à la console du nuage | 14. S’assurer que les tâches administratives sont effectuées par les utilisateurs autorisés | TODO |
| 3. Limiter les accès à la console du nuage | 15. Implémenter un mécanisme d’application des autorisations d’accès | AWS IAM |
| 3. Limiter les accès à la console du nuage | 16. Implémenter un mécanisme de protection contre les attaques de mots de passe | Au niveau SSO : dépend du fournisseur d'identité. Au niveau AWS : TODO |
| 4. Définir les comptes de surveillance d’entreprise | 17. Attribuer des rôles aux intervenants approuvés pour permettre une visibilité sur le plan organisationnel | TODO |
| 4. Définir les comptes de surveillance d’entreprise | 18. Implémenter l’authentification multifacteur (MFA) aux comptes de surveillance d’entreprise | MFA au niveau du compte de gestion : à activer au démarrage de l'organisation. MFA au niveau des utilisateurs IAM dans le compte de gestion : à activer à chaque création d'utilisateur. MFA au niveau SSO : à activer au niveau du fournisseur d'identité utilisé. |
| 5. Déterminer la localisation des données | 19. Choix des lieux géographiques pour héberger les renseignements personnels détenus | AWS Control Tower Region Deny à activer préalablement. Configuration de la région d'accueil dans la configuration LZA global-config.yaml |
| 5. Déterminer la localisation des données | 20. Limiter les lieux géographiques d’hébergement des données aux régions approuvées | AWS Control Tower Region Deny à activer préalablement. |
| 6. Protéger les données au repos  | 21. Déterminer le niveau de sensibilité des données à protéger | TODO |
| 6. Protéger les données au repos  | 22. Implémenter un mécanisme de chiffrement par défaut pour les données au repos | LZA exige le chiffrement des volumes EBS, des compartiments S3, et des fichiers de journaux (voir organization-config.yaml et security-config.yaml) |
| 6. Protéger les données au repos  | 23. Utiliser des algorithmes et des protocoles cryptographiques approuvés | AWS KMS |
| 6. Protéger les données au repos  | 24. Implémenter une procédure de gestion des clés | AWS KMS |
| 7. Protéger les données en transit  | 25. Implémenter un mécanisme de chiffrement pour protéger la confidentialité et l’intégrité des données en transit | AWS VPN (ipsec), AWS Direct Connect (MACsec), SSL/TLS (ALB, web) |
| 7. Protéger les données en transit  | 26. Utiliser des algorithmes et des protocoles cryptographiques approuvés | TODO |
| 7. Protéger les données en transit  | 27. Chiffrer par défaut les données en transit pour toutes les communications | TODO |
| 7. Protéger les données en transit  | 28. Implémenter une procédure de gestion des clés | TODO |
| 8. Segmenter et séparer les données selon leur sensibilité  | 29. Développer une structure réseau cible prenant en compte la segmentation par des zones de sécurité | TODO |
| 8. Segmenter et séparer les données selon leur sensibilité  | 30. Renforcer le niveau de protection des interfaces de gestion | TODO |
| 9. Implémenter des services de sécurité réseau   | 31. Gérer et surveiller adéquatement les points d’entrée/sortie du trafic réseau dans les environnements infonuagiques | TODO - perimeter firewall needed - to add to config! |
| 9. Implémenter des services de sécurité réseau  | 32. Implémenter le filtrage des communications réseau pour les systèmes accessible depuis un réseau externe à l’environnement infonuagique | Groupes de sécurité |
| 9. Implémenter des services de sécurité réseau  | 33. Déployer des services de sécurité des périmètres réseau pour protéger les zones en accord avec le profil de risque de l’organisme | TODO |
| 9. Implémenter des services de sécurité réseau  | 34. Protéger et restreindre les accès aux services de stockage infonuagique aux entités autorisées  | TODO |
| 10. Mettre en place des services de cyberdéfense  | 35. Signer un protocole d’entente pour des services de cyberdéfense avec votre COCD affilié | TODO |
| 11. Implémenter la journalisation et la surveillance | 36. Implémenter un niveau adéquat de journalisation et d’audit  | AWS CloudTrail |
| 11. Implémenter la journalisation et la surveillance | 37. Identifier les événements qui doivent être audités  | TODO |
| 11. Implémenter la journalisation et la surveillance | 38. Centraliser les journaux dans un emplacement unique | Configuration du compte d'archive de journaux par AWS Control Tower + configurations supplémentaires dans organization-config.yaml et security-config.yaml |
| 11. Implémenter la journalisation et la surveillance | 39. Envoyer les alertes et notifications à un contact ou à une équipe appropriée | SNS - voir security-config.yaml |
| 11. Implémenter la journalisation et la surveillance | 40. Configurer et utiliser une source autoritaire du temps pour toutes les composantes sous surveillance | TODO |
| 11. Implémenter la journalisation et la surveillance | 41. Faire une surveillance continue des événements et des performances des systèmes | TODO |
| 11. Implémenter la journalisation et la surveillance | 42. Rétention et conservation des journaux | TODO |
| 12. Restreindre les accès aux produits de la place de marché infonuagique | 43. Restreindre la consommation des produits au catalogue du Courtier | TODO - devrait être une SCP |
