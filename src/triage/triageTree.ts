export type TriageNode = {
  id: string;
  question: string;
  yes: string | null;
  no: string | null;
  isLeaf: boolean;
  treatment: string;
  severity: 'green' | 'yellow' | 'red';
  steps: string[];
};

export const TRIAGE_ROOT = 'start';

export const TRIAGE_TREE: Record<string, TriageNode> = {
  start: {
    id: 'start',
    question: 'Is the person conscious?',
    yes: 'bleeding',
    no: 'airway',
    isLeaf: false,
    treatment: '',
    severity: 'yellow',
    steps: [],
  },
  airway: {
    id: 'airway',
    question: 'Is the person breathing normally?',
    yes: 'recovery',
    no: 'cpr',
    isLeaf: false,
    treatment: '',
    severity: 'red',
    steps: [],
  },
  cpr: {
    id: 'cpr',
    question: '',
    yes: null,
    no: null,
    isLeaf: true,
    treatment: 'Cardiac arrest likely',
    severity: 'red',
    steps: ['Call for help immediately', 'Start chest compressions at 100-120/min', 'Use AED if available'],
  },
  recovery: {
    id: 'recovery',
    question: '',
    yes: null,
    no: null,
    isLeaf: true,
    treatment: 'Unconscious but breathing',
    severity: 'yellow',
    steps: ['Place in recovery position', 'Keep airway clear', 'Monitor breathing continuously'],
  },
  bleeding: {
    id: 'bleeding',
    question: 'Is there heavy bleeding?',
    yes: 'heavyBleedingLeaf',
    no: 'burns',
    isLeaf: false,
    treatment: '',
    severity: 'yellow',
    steps: [],
  },
  heavyBleedingLeaf: {
    id: 'heavyBleedingLeaf',
    question: '',
    yes: null,
    no: null,
    isLeaf: true,
    treatment: 'Severe hemorrhage',
    severity: 'red',
    steps: ['Apply direct pressure', 'Pack wound with clean cloth/gauze', 'Apply tourniquet for limb bleed if needed'],
  },
  burns: {
    id: 'burns',
    question: 'Are there serious burns or chest wounds?',
    yes: 'burnLeaf',
    no: 'fractureCheck',
    isLeaf: false,
    treatment: '',
    severity: 'yellow',
    steps: [],
  },
  burnLeaf: {
    id: 'burnLeaf',
    question: '',
    yes: null,
    no: null,
    isLeaf: true,
    treatment: 'Burn or chest trauma protocol',
    severity: 'red',
    steps: ['Cool burns with clean water for 20 minutes', 'Do not pop blisters', 'Seal chest wound with vented dressing'],
  },
  fractureCheck: {
    id: 'fractureCheck',
    question: 'Is there obvious broken bone, hypothermia, choking, or allergic reaction?',
    yes: 'stabilizeLeaf',
    no: 'minorLeaf',
    isLeaf: false,
    treatment: '',
    severity: 'yellow',
    steps: [],
  },
  stabilizeLeaf: {
    id: 'stabilizeLeaf',
    question: '',
    yes: null,
    no: null,
    isLeaf: true,
    treatment: 'Stabilize and monitor',
    severity: 'yellow',
    steps: ['Immobilize injured area', 'Treat airway first if choking', 'Warm slowly for hypothermia', 'Use epinephrine for severe allergy if available'],
  },
  minorLeaf: {
    id: 'minorLeaf',
    question: '',
    yes: null,
    no: null,
    isLeaf: true,
    treatment: 'Likely minor injury',
    severity: 'green',
    steps: ['Clean wounds', 'Hydrate and rest', 'Reassess every 15 minutes'],
  },
};
