import type { Language } from '@pulse/shared';
import { PRODUCT_NAME } from '@pulse/shared';
import { Shell } from '../components/Shell';
import { useI18n } from '../lib/i18n';

interface Section {
  heading: string;
  paragraphs: string[];
}

/**
 * DRAFT privacy notice (§10). Placeholders in [brackets] must be filled, and the whole notice reviewed by
 * klu's data protection officer before real classroom use (see docs/deployment.md).
 */
const CONTENT: Record<Language, { title: string; draft: string; sections: Section[] }> = {
  de: {
    title: 'Datenschutzerklärung',
    draft: 'Entwurf – vor dem Einsatz in Lehrveranstaltungen von der Datenschutzbeauftragten der klu zu prüfen.',
    sections: [
      {
        heading: 'Verantwortlich',
        paragraphs: [
          '[PLATZHALTER: Name und Anschrift der verantwortlichen Stelle]',
          'Kontakt für Datenschutzfragen: [PLATZHALTER: E-Mail-Adresse der Datenschutzbeauftragten]',
        ],
      },
      {
        heading: 'Welche Daten verarbeitet werden',
        paragraphs: [
          `${PRODUCT_NAME} speichert die abgegebenen Antworten, eine zufällig erzeugte Teilnahme-Kennung, einen freiwillig gewählten Namen für Quiz-Ranglisten und die Zeitpunkte der Antworten.`,
          'Nicht gespeichert werden: IP-Adressen, Gerätedaten, Klarnamen, E-Mail-Adressen oder sonstige Kennungen. Für die Teilnahme ist kein Konto nötig.',
        ],
      },
      {
        heading: 'Zweck und Rechtsgrundlage',
        paragraphs: [
          'Die Daten dienen ausschließlich der Durchführung von Live-Abstimmungen, Quizfragen und Fragerunden in Lehrveranstaltungen und der Auswertung durch die Vortragenden.',
          'Rechtsgrundlage: [PLATZHALTER: durch die Datenschutzbeauftragte festzulegen, z. B. Art. 6 Abs. 1 lit. e oder f DSGVO]',
        ],
      },
      {
        heading: 'Speicherdauer',
        paragraphs: [
          'Alle Antworten einer Präsentation werden 90 Tage nach der letzten Aktivität automatisch gelöscht. Vortragende können die Daten jederzeit früher löschen.',
        ],
      },
      {
        heading: 'Cookies und lokaler Speicher',
        paragraphs: [
          'Ein technisch notwendiges Cookie (pulse_pid) und der lokale Speicher des Browsers halten die zufällige Teilnahme-Kennung, die gewählte Sprache und den Quiz-Namen fest, damit doppelte Antworten verhindert werden. Es gibt keine Analyse- oder Werbe-Cookies; eine Einwilligung ist daher nicht erforderlich.',
        ],
      },
      {
        heading: 'Hosting und Protokolle',
        paragraphs: [
          'Der Dienst wird ausschließlich in der EU betrieben: [PLATZHALTER: Hosting-Anbieter und Standort].',
          'Zugriffsprotokolle des Webservers sind abgeschaltet. Anwendungsprotokolle enthalten keine Antworten, Namen oder Kennungen.',
        ],
      },
      {
        heading: 'Rechte',
        paragraphs: [
          'Es bestehen die Rechte auf Auskunft, Berichtigung, Löschung, Einschränkung und Widerspruch nach der DSGVO. Da keine Identität gespeichert wird, ist eine Zuordnung nur über die Teilnahme-Kennung dieses Geräts möglich.',
          'Beschwerden sind an die österreichische Datenschutzbehörde (dsb.gv.at) möglich.',
        ],
      },
    ],
  },
  en: {
    title: 'Privacy notice',
    draft: "Draft – to be reviewed by klu's data protection officer before use in courses.",
    sections: [
      {
        heading: 'Controller',
        paragraphs: [
          '[PLACEHOLDER: name and address of the controller]',
          'Data protection contact: [PLACEHOLDER: e-mail address of the data protection officer]',
        ],
      },
      {
        heading: 'What is processed',
        paragraphs: [
          `${PRODUCT_NAME} stores the answers given, a randomly generated participant id, an optional name chosen for quiz leaderboards and the time of each answer.`,
          'Not stored: IP addresses, device data, real names, e-mail addresses or any other identifiers. No account is needed to take part.',
        ],
      },
      {
        heading: 'Purpose and legal basis',
        paragraphs: [
          'The data is used only to run live polls, quizzes and Q&A sessions in courses and for the presenters to evaluate them.',
          'Legal basis: [PLACEHOLDER: to be set by the data protection officer, e.g. Art. 6(1)(e) or (f) GDPR]',
        ],
      },
      {
        heading: 'Retention',
        paragraphs: [
          'All answers of a presentation are deleted automatically 90 days after its last activity. Presenters can delete the data earlier at any time.',
        ],
      },
      {
        heading: 'Cookies and local storage',
        paragraphs: [
          "One strictly necessary cookie (pulse_pid) and the browser's local storage keep the random participant id, the chosen language and the quiz name to prevent duplicate answers. There are no analytics or advertising cookies, so no consent is required.",
        ],
      },
      {
        heading: 'Hosting and logs',
        paragraphs: [
          'The service runs in the EU only: [PLACEHOLDER: hosting provider and location].',
          'Web server access logs are switched off. Application logs contain no answers, names or identifiers.',
        ],
      },
      {
        heading: 'Your rights',
        paragraphs: [
          'You have the rights of access, rectification, erasure, restriction and objection under the GDPR. As no identity is stored, data can only be matched through the participant id on this device.',
          'You can lodge a complaint with the Austrian Data Protection Authority (dsb.gv.at).',
        ],
      },
    ],
  },
};

export function PrivacyScreen() {
  const { language } = useI18n();
  const content = CONTENT[language];
  return (
    <Shell>
      <article className="mt-4">
        <h1 className="text-[28px] font-bold text-navy">{content.title}</h1>
        <p className="mt-3 rounded-brand bg-mist px-4 py-3 text-[16px] font-semibold">{content.draft}</p>
        {content.sections.map((section) => (
          <section key={section.heading} className="mt-7">
            <h2 className="text-[20px] font-bold text-navy">{section.heading}</h2>
            {section.paragraphs.map((p) => (
              <p key={p} className="mt-2 text-[17px]">
                {p}
              </p>
            ))}
          </section>
        ))}
      </article>
    </Shell>
  );
}
