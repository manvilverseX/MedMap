export interface IntakeQuestion {
  /** Unique stable identifier, e.g. "chief_complaint" */
  id: string;

  /** Human-readable section name, e.g. "Chief Complaint" */
  category: string;

  /** The question text shown to the patient */
  prompt: string;

  /** Optional helper text below the prompt */
  helperText?: string;

  /** Input type: 'text' for single-line, 'textarea' for multi-line */
  inputType: 'text' | 'textarea';

  /** Placeholder text for the input field */
  placeholder: string;
}

export const INTAKE_QUESTIONS: IntakeQuestion[] = [
  {
    id: 'chief_complaint',
    category: 'Chief Complaint',
    prompt: 'What is the main reason for your visit today?',
    helperText: 'Describe your primary concern in a few words.',
    inputType: 'text',
    placeholder: 'e.g. persistent headache for 2 weeks',
  },
  {
    id: 'present_illness',
    category: 'History of Present Illness',
    prompt: 'Please describe your current symptoms in detail.',
    helperText:
      'When did it start? How has it changed? What makes it better or worse?',
    inputType: 'textarea',
    placeholder:
      'e.g. Started about two weeks ago with a dull ache behind my eyes…',
  },
  {
    id: 'past_medical',
    category: 'Past Medical History',
    prompt: 'Do you have any previously diagnosed medical conditions?',
    helperText:
      'Include chronic conditions, past diagnoses, and hospitalizations.',
    inputType: 'textarea',
    placeholder: 'e.g. Type 2 diabetes diagnosed in 2018, hypertension…',
  },
  {
    id: 'past_surgical',
    category: 'Past Surgical History',
    prompt: 'Have you had any surgeries or procedures in the past?',
    helperText: 'Include the year and type of procedure if you remember.',
    inputType: 'textarea',
    placeholder: 'e.g. Appendectomy in 2015, knee arthroscopy in 2020…',
  },
  {
    id: 'medications',
    category: 'Medication History',
    prompt: 'What medications are you currently taking?',
    helperText:
      'Include prescription drugs, over-the-counter medicines, and supplements.',
    inputType: 'textarea',
    placeholder: 'e.g. Metformin 500mg twice daily, Vitamin D 1000 IU…',
  },
  {
    id: 'allergies',
    category: 'Allergies',
    prompt: 'Do you have any known allergies?',
    helperText:
      'Include allergies to medications, foods, and environmental allergens. Describe the reaction if possible.',
    inputType: 'textarea',
    placeholder: 'e.g. Penicillin — causes rash, peanuts — anaphylaxis…',
  },
  {
    id: 'family_history',
    category: 'Family History',
    prompt:
      'Is there any significant medical history in your immediate family?',
    helperText:
      'Include conditions in parents, siblings, or grandparents such as heart disease, cancer, or diabetes.',
    inputType: 'textarea',
    placeholder:
      'e.g. Father — heart disease, Mother — Type 2 diabetes…',
  },
  {
    id: 'review_of_systems',
    category: 'Review of Systems',
    prompt:
      'Are you experiencing any other symptoms we haven\'t discussed?',
    helperText:
      'Consider changes in weight, sleep, appetite, vision, breathing, digestion, or mood.',
    inputType: 'textarea',
    placeholder:
      'e.g. Occasional dizziness when standing up, mild fatigue in the afternoons…',
  },
];
