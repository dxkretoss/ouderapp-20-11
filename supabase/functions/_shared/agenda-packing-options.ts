// Editable option list for "Iets toevoegen" on the packing list (Mee met de wissel). Dutch ids; the app
// translates known ids and shows typed items as they were typed. Items a parent typed earlier are added
// to this list per family by manage-handover (list → options).
export const PACKING_OPTIONS = [
  "Zwemspullen", "Gymtas", "Medicijnen", "Voetbalspullen", "Sportkleding", "Schooltas",
  "Knuffel", "Pyjama", "Jas", "Oplader", "Tablet", "Huiswerk",
];

/** Checklists are removed one month after the handover (the handover moment itself stays in the agenda). */
export const CHECKLIST_RETENTION_DAYS = 31;
