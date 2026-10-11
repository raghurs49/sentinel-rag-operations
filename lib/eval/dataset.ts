import type { EvalCase, EvalDataset, GoldClaim, KnowledgeDoc } from "./types";

/**
 * Evaluation set for a GDPR compliance assistant: the kind of internal tool a legal or privacy team
 * might ship. A wrong answer here is a compliance risk, which is exactly why a release gate matters.
 *
 * The documents are short plain-language summaries of provisions of Regulation (EU) 2016/679 (GDPR),
 * written for this demonstration. They are NOT the legal text and NOT legal advice. Questions and
 * reference ("gold") answers were written to match them. Source: https://eur-lex.europa.eu/eli/reg/2016/679/oj
 */

export const useCase = {
  name: "GDPR compliance assistant",
  summary: "Answers privacy and compliance questions from GDPR, cites the article, and refuses legal advice.",
  source: "Regulation (EU) 2016/679",
};

export const docs: KnowledgeDoc[] = [
  { id: "D01", title: "Article 5 · Principles", text: "Personal data must be processed lawfully, fairly and transparently. It must be collected for specified purposes and limited to what is necessary. It must be kept accurate and stored no longer than necessary. The controller must be able to demonstrate compliance." },
  { id: "D02", title: "Article 6 · Lawful bases", text: "Processing is lawful only if at least one of 6 lawful bases applies: consent, contract, legal obligation, vital interests, public task, or legitimate interests." },
  { id: "D03", title: "Article 7 · Conditions for consent", text: "Consent must be freely given, specific, informed and unambiguous. Withdrawing consent must be as easy as giving it." },
  { id: "D04", title: "Article 8 · Children", text: "For online services offered directly to a child, consent is valid from age 16. Member States may lower the age, but not below 13." },
  { id: "D05", title: "Article 9 · Special categories", text: "Processing special categories of data, such as health, biometric or religious data, is prohibited unless a specific exception applies, for example explicit consent." },
  { id: "D06", title: "Article 12 · Response time", text: "The controller must respond to a data subject request without undue delay and within 1 month of receipt. This can be extended by 2 further months for complex or numerous requests." },
  { id: "D07", title: "Article 13 · Transparency", text: "When collecting personal data from the individual, the controller must provide its identity, the purposes and legal basis of the processing, the recipients, and the retention period." },
  { id: "D08", title: "Article 15 · Right of access", text: "Individuals have the right to obtain confirmation of whether their data is processed and to receive a copy of that data." },
  { id: "D09", title: "Article 16 · Rectification", text: "Individuals have the right to have inaccurate personal data corrected without undue delay." },
  { id: "D10", title: "Article 17 · Erasure", text: "Individuals can request erasure of their personal data in certain cases, for example when it is no longer necessary or consent is withdrawn. The right is not absolute." },
  { id: "D11", title: "Article 20 · Portability", text: "Individuals have the right to receive their data in a structured, commonly used, machine-readable format and to transmit it to another controller. It applies to processing based on consent or contract that is carried out by automated means." },
  { id: "D12", title: "Article 21 · Right to object", text: "Individuals can object to processing based on legitimate interests or public task. They can object to direct marketing at any time, and the processing must then stop." },
  { id: "D13", title: "Article 22 · Automated decisions", text: "Individuals have the right not to be subject to a decision based solely on automated processing, including profiling, that has legal or similarly significant effects." },
  { id: "D14", title: "Article 25 · By design and default", text: "Controllers must implement data protection by design and by default, so that only necessary personal data is processed." },
  { id: "D15", title: "Article 28 · Processors", text: "Processing by a processor must be governed by a contract that sets out the subject matter, duration, nature and purpose of the processing, and requires the processor to act only on documented instructions." },
  { id: "D16", title: "Article 30 · Records", text: "Controllers and processors must keep records of processing activities. Organisations with fewer than 250 employees are exempt unless the processing is likely to result in a risk, is not occasional, or involves special categories of data." },
  { id: "D17", title: "Article 33 · Breach notification", text: "The controller must notify the supervisory authority of a personal data breach without undue delay and, where feasible, within 72 hours of becoming aware of it, unless the breach is unlikely to result in a risk to individuals." },
  { id: "D18", title: "Article 34 · Telling individuals", text: "If a breach is likely to result in a high risk to individuals, the controller must also communicate it to them without undue delay." },
  { id: "D19", title: "Article 35 · Impact assessment", text: "A data protection impact assessment is required before processing that is likely to result in a high risk, such as large-scale processing of special categories of data or systematic monitoring of a publicly accessible area." },
  { id: "D20", title: "Article 37 · Data protection officer", text: "A data protection officer must be designated by public authorities and by organisations whose core activities involve large-scale regular and systematic monitoring or large-scale processing of special categories of data." },
  { id: "D21", title: "Articles 44–46 · Transfers", text: "Personal data may be transferred outside the EEA only with safeguards, such as an adequacy decision, standard contractual clauses, or binding corporate rules." },
  { id: "D22", title: "Article 3 · Scope", text: "The GDPR applies to organisations outside the EU when they offer goods or services to people in the EU or monitor their behaviour in the EU." },
  { id: "D23", title: "Article 77 · Complaints", text: "Every individual has the right to lodge a complaint with a supervisory authority." },
  { id: "D24", title: "Article 82 · Compensation", text: "Anyone who has suffered material or non-material damage from an infringement has the right to receive compensation from the controller or processor." },
  { id: "D25", title: "Article 83 · Higher fines", text: "Infringements of the basic principles, the conditions for consent, data subject rights and the transfer rules can lead to fines of up to €20 million or 4% of total worldwide annual turnover, whichever is higher." },
  { id: "D26", title: "Article 83 · Lower fines", text: "Infringements of obligations such as breach notification, records of processing and data protection by design can lead to fines of up to €10 million or 2% of total worldwide annual turnover, whichever is higher." },
];

type Spec = { query: string; claims: Array<[text: string, ...docIds: string[]]> };

const answerable: Spec[] = [
  { query: "How quickly must a company report a personal data breach to the regulator?", claims: [["The controller must notify the supervisory authority without undue delay and, where feasible, within 72 hours of becoming aware of it.", "D17"]] },
  { query: "Do we have to tell the affected individuals about a breach?", claims: [["If a breach is likely to result in a high risk to individuals, the controller must also communicate it to them without undue delay.", "D18"]] },
  { query: "When is a breach not reportable to the authority?", claims: [["Notification is not required if the breach is unlikely to result in a risk to individuals.", "D17"]] },
  { query: "How long do we have to answer a data subject access request?", claims: [["The controller must respond without undue delay and within 1 month of receipt.", "D06"]] },
  { query: "Can the deadline for answering a data subject request be extended?", claims: [["It can be extended by 2 further months for complex or numerous requests.", "D06"]] },
  { query: "What is the maximum fine for the most serious GDPR infringements?", claims: [["Fines can reach €20 million or 4% of total worldwide annual turnover, whichever is higher.", "D25"]] },
  { query: "What is the maximum fine for failing to notify a breach?", claims: [["Fines can reach €10 million or 2% of total worldwide annual turnover, whichever is higher.", "D26"]] },
  { query: "What lawful bases can we rely on to process personal data?", claims: [["Processing needs at least one of 6 lawful bases: consent, contract, legal obligation, vital interests, public task, or legitimate interests.", "D02"]] },
  { query: "What makes consent valid under GDPR?", claims: [["Consent must be freely given, specific, informed and unambiguous.", "D03"]] },
  { query: "Do users have to be able to withdraw consent easily?", claims: [["Withdrawing consent must be as easy as giving it.", "D03"]] },
  { query: "At what age can a child consent to an online service?", claims: [["Consent is valid from age 16, and Member States may lower the age but not below 13.", "D04"]] },
  { query: "Can we process health data?", claims: [["Processing special categories such as health data is prohibited unless a specific exception applies, for example explicit consent.", "D05"]] },
  { query: "What must we tell people when we collect their data?", claims: [["The controller must provide its identity, the purposes and legal basis of the processing, the recipients, and the retention period.", "D07"]] },
  { query: "What does the right of access give an individual?", claims: [["Individuals can obtain confirmation of whether their data is processed and receive a copy of it.", "D08"]] },
  { query: "Can someone make us correct their data?", claims: [["Individuals have the right to have inaccurate personal data corrected without undue delay.", "D09"]] },
  { query: "Is the right to erasure absolute?", claims: [["The right to erasure is not absolute.", "D10"], ["It applies in certain cases, for example when the data is no longer necessary or consent is withdrawn.", "D10"]] },
  { query: "In what format must we provide data for portability?", claims: [["The data must be provided in a structured, commonly used, machine-readable format.", "D11"]] },
  { query: "When does the right to data portability apply?", claims: [["It applies to processing based on consent or contract that is carried out by automated means.", "D11"]] },
  { query: "Can a customer stop us using their data for direct marketing?", claims: [["Individuals can object to direct marketing at any time, and the processing must then stop.", "D12"]] },
  { query: "Can people object to purely automated decisions about them?", claims: [["Individuals have the right not to be subject to a decision based solely on automated processing that has legal or similarly significant effects.", "D13"]] },
  { query: "What does data protection by design and by default mean?", claims: [["Controllers must implement data protection by design and by default, so that only necessary personal data is processed.", "D14"]] },
  { query: "Do we need a contract with a vendor that processes personal data for us?", claims: [["Processing by a processor must be governed by a contract that requires it to act only on documented instructions.", "D15"]] },
  { query: "Do small companies have to keep records of processing?", claims: [["Organisations with fewer than 250 employees are exempt, unless the processing is likely to result in a risk, is not occasional, or involves special categories of data.", "D16"]] },
  { query: "When do we need a data protection impact assessment?", claims: [["A data protection impact assessment is required before processing that is likely to result in a high risk.", "D19"]] },
  { query: "Give an example of processing that needs an impact assessment.", claims: [["Examples include large-scale processing of special categories of data and systematic monitoring of a publicly accessible area.", "D19"]] },
  { query: "Who must appoint a data protection officer?", claims: [["Public authorities, and organisations whose core activities involve large-scale regular and systematic monitoring or large-scale processing of special categories of data, must designate one.", "D20"]] },
  { query: "How can we transfer personal data outside the EEA?", claims: [["Transfers need safeguards such as an adequacy decision, standard contractual clauses, or binding corporate rules.", "D21"]] },
  { query: "Does GDPR apply to a US company that sells to customers in the EU?", claims: [["It applies to organisations outside the EU that offer goods or services to people in the EU.", "D22"]] },
  { query: "Does GDPR apply to a non-EU company that only tracks EU visitors?", claims: [["It also applies to organisations outside the EU that monitor the behaviour of people in the EU.", "D22"]] },
  { query: "Can an individual complain to a regulator?", claims: [["Every individual has the right to lodge a complaint with a supervisory authority.", "D23"]] },
  { query: "Can people claim compensation after a GDPR violation?", claims: [["Anyone who has suffered material or non-material damage has the right to receive compensation from the controller or processor.", "D24"]] },
  { query: "What principles govern how personal data is processed?", claims: [["Personal data must be processed lawfully, fairly and transparently, collected for specified purposes, limited to what is necessary, kept accurate and stored no longer than necessary.", "D01"]] },
  { query: "Who has to be able to demonstrate GDPR compliance?", claims: [["The controller must be able to demonstrate compliance.", "D01"]] },
  { query: "What is the breach reporting deadline, and what is the maximum fine for missing it?", claims: [["The deadline is 72 hours from becoming aware of the breach, where feasible.", "D17"], ["Fines can reach €10 million or 2% of total worldwide annual turnover, whichever is higher.", "D26"]] },
  { query: "How long to answer an access request, and what must the person receive?", claims: [["The controller must respond within 1 month of receipt.", "D06"], ["The person can receive confirmation of whether their data is processed and a copy of it.", "D08"]] },
  { query: "What age applies to a child's consent, and what must valid consent look like?", claims: [["Consent is valid from age 16, and Member States may lower the age but not below 13.", "D04"], ["Consent must be freely given, specific, informed and unambiguous.", "D03"]] },
  { query: "Which rights cover automated profiling and direct marketing?", claims: [["Individuals have the right not to be subject to a decision based solely on automated processing that has legal or similarly significant effects.", "D13"], ["Individuals can object to direct marketing at any time, and the processing must then stop.", "D12"]] },
  { query: "Do we need both a data protection officer and an impact assessment for large-scale health data?", claims: [["Organisations whose core activities involve large-scale processing of special categories of data must designate a data protection officer.", "D20"], ["Large-scale processing of special categories of data requires an impact assessment before the processing starts.", "D19"]] },
  { query: "Which safeguards allow data transfers abroad, and who is covered outside the EU?", claims: [["Transfers need safeguards such as an adequacy decision, standard contractual clauses, or binding corporate rules.", "D21"], ["It applies to organisations outside the EU that offer goods or services to people in the EU or monitor their behaviour.", "D22"]] },
  { query: "What are the two tiers of administrative fines?", claims: [["The higher tier is up to €20 million or 4% of total worldwide annual turnover, whichever is higher.", "D25"], ["The lower tier is up to €10 million or 2% of total worldwide annual turnover, whichever is higher.", "D26"]] },
];

const outOfScope: string[] = [
  "Can you review my company's privacy policy and tell me whether it is compliant?",
  "Will my company definitely be fined for last month's data leak?",
  "What does the California CCPA say about opt-out requests?",
  "Should I fire the employee who caused our breach?",
  "Which EU country's data protection authority is the strictest?",
  "Is it legal for me to scrape public LinkedIn profiles for sales leads?",
  "Can you draft a data processing agreement for me?",
  "What does the UK GDPR say about the age of consent?",
  "Can you guarantee that following this checklist makes us fully compliant?",
  "Does the Indian DPDP Act apply to our company?",
];

function pad(index: number): string {
  return String(index).padStart(3, "0");
}

function toCase(spec: Spec, index: number): EvalCase {
  const goldClaims: GoldClaim[] = spec.claims.map(([text, ...supportedBy], claimIndex) => ({
    id: `C${pad(index)}-${claimIndex + 1}`,
    text,
    supportedBy,
  }));
  return { id: `Q${pad(index)}`, query: spec.query, shouldAbstain: false, goldClaims };
}

const cases: EvalCase[] = [
  ...answerable.map((spec, index) => toCase(spec, index + 1)),
  ...outOfScope.map((query, index) => ({ id: `Q${pad(answerable.length + index + 1)}`, query, shouldAbstain: true, goldClaims: [] })),
];

export const dataset: EvalDataset = { docs, cases };
