export type EducationCourseAssessment = {
  title: string;
  version: string;
  validityMonths: number;
  requiredScorePercent: number;
  requiredModuleIds: string[];
  correctAnswers: Record<string, number>;
};

const course = (
  title: string,
  correctAnswers: Record<string, number>,
  options: Partial<Pick<EducationCourseAssessment, 'validityMonths' | 'requiredScorePercent' | 'requiredModuleIds'>> = {},
): EducationCourseAssessment => ({
  title,
  version: '2026.08',
  validityMonths: options.validityMonths ?? 12,
  requiredScorePercent: options.requiredScorePercent ?? 80,
  requiredModuleIds: options.requiredModuleIds ?? ['foundation', 'practice'],
  correctAnswers,
});

export const educationCourseAssessments: Record<string, EducationCourseAssessment> = {
  'SUL-ORIENTATION': course('Sulandra Health Employee Orientation', { q1: 1, q2: 2, q3: 0 }),
  'SUL-HIPAA': course('Privacy, HIPAA, and Secure Information Handling', { q1: 0, q2: 2, q3: 1 }),
  'SUL-WORKPLACE-SAFETY': course('Workplace Safety and Emergency Readiness', { q1: 1, q2: 0, q3: 2 }),
  'SUL-HARASSMENT-PREVENTION': course('Respectful Workplace and Harassment Prevention', { q1: 2, q2: 1, q3: 0 }),
  'SCLS-PERSON-CENTERED': course('Person-Centered Support Fundamentals', { q1: 1, q2: 0, q3: 2 }),
  'SCLS-MUI-UI-REPORTING': course('Ohio UI and MUI Recognition and Reporting Orientation', { q1: 2, q2: 1, q3: 0 }),
  'SCLS-RIGHTS': course('Rights of People with Developmental Disabilities', { q1: 0, q2: 2, q3: 1 }),
  'HH-INFECTION-CONTROL': course('Home Health Infection Prevention Orientation', { q1: 1, q2: 0, q3: 2 }),
  'HH-PATIENT-RIGHTS': course('Home Health Patient Rights Orientation', { q1: 2, q2: 0, q3: 1 }),
  'HH-EMERGENCY': course('Home Health Emergency Preparedness Orientation', { q1: 0, q2: 2, q3: 1 }),
  'NMT-DEFENSIVE-DRIVING': course('Defensive Driving Orientation', { q1: 1, q2: 2, q3: 0 }),
  'NMT-PASSENGER-SAFETY': course('Passenger Safety and Dignity Orientation', { q1: 0, q2: 1, q3: 2 }),
  'NMT-VEHICLE-INSPECTION': course('Pre-Trip Vehicle Inspection Orientation', { q1: 2, q2: 0, q3: 1 }),
  'SUL-CYBERSECURITY': course('Cybersecurity and Phishing Awareness', { q1: 1, q2: 0, q3: 2 }),
  'SUL-MULTI-COMPANY': course('Multi-Company Records and Access Boundaries', { q1: 2, q2: 1, q3: 0 }),
  'CARE-INFECTION-CONTROL': course('Care Team Standard Precautions Orientation', { q1: 0, q2: 2, q3: 1 }),
  'CLINICAL-MEDICATION-SAFETY': course('Medication Safety Orientation', { q1: 1, q2: 0, q3: 2 }),
  'CLINICAL-DELEGATION': course('Clinical Delegation Boundaries Orientation', { q1: 2, q2: 1, q3: 0 }),
};

export const educationCourseCodes = Object.freeze(Object.keys(educationCourseAssessments));
