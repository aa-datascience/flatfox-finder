import Link from "next/link";

export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <Link href="/" className="text-sm text-gray-500 hover:text-gray-700 mb-6 inline-block">
        &larr; Home
      </Link>
      <h1 className="text-2xl font-bold mb-6">Privacy Policy</h1>
      <div className="prose prose-sm text-gray-700 space-y-4">
        <p>
          Flatfox Finder (&quot;we&quot;, &quot;our&quot;, &quot;the service&quot;) processes your
          personal data to match you with housing listings on Flatfox. This policy explains what
          data we collect, why, and your rights.
        </p>

        <h2 className="text-lg font-semibold mt-6">1. Data we collect</h2>
        <ul className="list-disc pl-6 space-y-1">
          <li>
            <strong>Account data:</strong> email address, name, preferred language, hashed password.
          </li>
          <li>
            <strong>Profile data:</strong> housing preferences you enter (budget, cities, rooms, move-in date,
            lifestyle preferences).
          </li>
          <li>
            <strong>Usage data:</strong> match views, message drafts, account actions (anonymised, no PII logged).
          </li>
        </ul>

        <h2 className="text-lg font-semibold mt-6">2. How we use your data</h2>
        <ul className="list-disc pl-6 space-y-1">
          <li>Match you with relevant Flatfox listings using our scoring algorithm.</li>
          <li>Generate personalised message drafts using AI (Anthropic Claude). Your name, email,
            and phone number are <strong>never</strong> sent to the AI — we use placeholders and
            substitute afterwards.</li>
          <li>Send you email notifications about new matches (if SMTP is configured).</li>
        </ul>

        <h2 className="text-lg font-semibold mt-6">3. AI processing</h2>
        <p>
          We use Anthropic Claude to extract housing preferences from free text and to draft
          contact messages. Before any AI call, we strip personally identifiable information
          (emails, phone numbers, names) and replace them with placeholders. The AI never
          receives your real identity.
        </p>

        <h2 className="text-lg font-semibold mt-6">4. Data sharing</h2>
        <p>
          We do not sell your data. We share data only with:
        </p>
        <ul className="list-disc pl-6 space-y-1">
          <li><strong>Anthropic</strong> — anonymised text for AI processing (no PII).</li>
          <li><strong>Flatfox</strong> — only when you choose to open a listing on their site. We do not
            send your data to Flatfox automatically.</li>
        </ul>

        <h2 className="text-lg font-semibold mt-6">5. Data retention</h2>
        <ul className="list-disc pl-6 space-y-1">
          <li>Your account and profile data are kept until you delete your account.</li>
          <li>Listing data from Flatfox is purged 90 days after a listing is removed, provided
            it has no associated matches.</li>
          <li>When you delete your account, all your data (profile, matches, messages) is
            permanently deleted immediately.</li>
        </ul>

        <h2 className="text-lg font-semibold mt-6">6. Your rights</h2>
        <p>You have the right to:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li><strong>Access</strong> your data via the Settings page.</li>
          <li><strong>Rectify</strong> your data by editing your profile.</li>
          <li><strong>Delete</strong> your account and all associated data at any time via Settings.</li>
          <li><strong>Withdraw consent</strong> by deleting your account.</li>
        </ul>

        <h2 className="text-lg font-semibold mt-6">7. Security</h2>
        <p>
          Passwords are hashed with bcrypt. All AI calls use PII stripping. We never log
          personally identifiable information. Database access is restricted to the application.
        </p>

        <h2 className="text-lg font-semibold mt-6">8. Contact</h2>
        <p>
          For questions about your data, contact us at the email address provided in the
          application.
        </p>

        <p className="text-xs text-gray-400 mt-8">Last updated: June 2026</p>
      </div>
    </main>
  );
}
