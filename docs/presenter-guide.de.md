# Pulse – Kurzanleitung für Lehrende

Live-Abstimmungen direkt in PowerPoint: Frage auf die Folie, Studierende antworten am Handy, Ergebnisse erscheinen
live auf der Folie. Keine App, kein Konto.

## 1. Einrichten (einmalig)

- **Pulse hinzufügen:** *Einfügen → Add-Ins → Meine Add-Ins* (neuere Versionen: *Start → Add-Ins → Weitere
  Add-Ins → Meine Add-Ins*) → Reiter **Freigegebener Ordner** bzw. **Entwickler-Add-Ins** → **Pulse** →
  *Hinzufügen*. Am Mac: *Einfügen → Add-Ins → Meine Add-Ins → Pulse*.
- Nur die PowerPoint-**Desktop-App** (Windows, Mac) wird unterstützt, nicht PowerPoint im Browser.

## 2. Frage anlegen

1. Neue Folie → Pulse einfügen (wie oben). **Rahmen auf Foliengröße ziehen.**
2. **»Was möchten Sie fragen?«** – Typ anklicken: Mehrfachauswahl, Wortwolke, Offene Frage, Skala, Quiz, Rangliste
   oder Fragen ans Publikum. Alle Folien einer Präsentation bekommen automatisch denselben Code.
3. Frage und Antworten eintippen. Ist der Rahmen groß genug, steht daneben eine Vorschau mit Beispieldaten.
   Schneller: **Enter** springt zur nächsten Antwort (am Ende kommt eine neue dazu), **Rücktaste** in einer leeren
   Antwort entfernt sie, eine **eingefügte Liste** (mehrere Zeilen, z. B. aus Word) füllt mehrere Antworten auf
   einmal.
4. **Fertig** klicken: Der Rahmen zeigt jetzt die Folie so, wie das Publikum sie sieht. Zum Ändern einfach
   hineinklicken (**Bearbeiten**).
5. **Speichern (Strg+S / Cmd+S)** – die Fragen stehen in der .pptx-Datei.

**Quiz: mit Namen oder anonym.** Im Quiz-Formular unter **Teilnahme**: *Mit Namen* – die Studierenden geben
direkt nach dem Beitritt einen Namen ein, der in der Rangliste erscheint. *Anonym* – keine Namenseingabe; die
Rangliste zeigt automatisch vergebene Namen wie »Otter 42«. Die Einstellung gilt für alle Quizfragen der
Präsentation (auch unter **⋯ → Einstellungen der Präsentation**).

Seltener gebraucht, unter **Weitere Optionen**: mehrere Antworten erlauben, richtige Antwort markieren, Ergebnisse
erst auf Klick zeigen, Ergebnisse auch am Handy, Quiz-Start per Klick. Im Menü **⋯ → Einstellungen der
Präsentation**: Titel, Sprache auf den Folien (DE/EN), hell/dunkel, QR-Code, Fragen ans Publikum,
Quiz-Teilnahme.

## 3. Folien kopieren

Folie duplizieren oder in eine andere Präsentation kopieren ist erlaubt: Pulse erkennt die Kopie beim nächsten
Klick in den Rahmen und legt eine **neue Frage** an (»Kopie erkannt – als neue Frage angelegt«). Die Antworten der
alten Frage bleiben bei der alten Frage.

## 4. Präsentieren

1. Bildschirmpräsentation starten. Die Frage wird **automatisch aktiv, sobald ihre Folie gezeigt wird**, und
   beim Weiterklicken wieder inaktiv.
2. Oben links steht der **6-stellige Code**, rechts ein kleiner QR-Code. Solange noch niemand geantwortet hat,
   erscheint der QR-Code groß in der Mitte. Ein Klick auf die Code-Zeile zeigt QR-Code, Adresse und Code
   bildschirmfüllend (nochmals klicken schließt) – praktisch für alle, die nicht scannen können.
3. Ergebnisse erscheinen live. Bei *Erst auf Klick zeigen*: auf **Ergebnisse zeigen** klicken. Beim Quiz mit
   Klick-Start: **Quiz starten** klicken. Die **Rangliste** zeigt die zehn Besten aller Quizfragen.
4. Referentenansicht mit zwei Bildschirmen funktioniert; verlorenes WLAN ist kein Problem – Pulse verbindet sich
   von selbst neu. Von einer Pulse-Folie direkt zur nächsten wechseln die Handys ohne Zwischenbildschirm; nach
   einer normalen Folie zeigen sie »Warte auf die nächste Frage …«.
5. Unten rechts auf der Folie steht, wie viele Personen gerade dabei sind.

**Fragen ans Publikum:** eine Folie vom Typ *Fragen ans Publikum* anlegen und dort **Fragen ans Publikum
einschalten** klicken. Studierende stellen Fragen und stimmen für die besten ab (Reiter *Fragen* am Handy).

## 5. Nach der Vorlesung

- Im Rahmen **⋯ → Ergebnisse & Export öffnen** → **Als Excel exportieren** oder **Als CSV exportieren**.
  Teilnehmende erscheinen pseudonym (Kennung, kein Name; beim Quiz der selbst gewählte bzw. vergebene Name).
- **⋯ → Ergebnisse zurücksetzen** löscht die Antworten einer Frage (z. B. nach einer Probe).
- **Alle Daten dieser Präsentation löschen** (auf der Export-Seite) löscht alle Antworten sofort. Ohne Zutun
  werden Antworten **90 Tage** nach der letzten Nutzung automatisch gelöscht; die Fragen bleiben in der Datei.

## Wenn etwas nicht geht

| Problem | Lösung |
|---|---|
| Rahmen bleibt weiß / Fehlermeldung | Pulse-Server nicht erreichbar. Im lokalen Betrieb das Pulse-Fenster (`Start-Pulse`) öffnen. |
| »Noch nicht vollständig: …« unten im Rahmen | Es fehlt noch etwas (z. B. zweite Antwort, richtige Antwort beim Quiz). |
| Handys kommen nicht auf die Seite | Die Adresse auf der Folie muss aus dem Mobilfunknetz erreichbar sein (Server bzw. Tunnel). Ohne Server: Pulse mit `Start-Pulse-Online` starten. |
| »Diese Frage existiert doppelt« | Folie wurde kopiert – auf **Als eigene Frage verwenden** klicken. |
