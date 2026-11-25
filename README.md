# Lector

Open a UBL invoice or credit note from your computer, inspect its source, and print it to A4. The demo at `/` includes a file picker, dropzone, and bundled OpenPeppol example. Files are read in the browser.

## Run locally

Use Node.js 20.19+ or 22.12+.

```sh
npm install
npm run dev
npm run typecheck
npm run lint
npm test
npm run build
```

## Integrate the viewer

```tsx
import { PeppolInvoiceViewer } from './src/PeppolInvoiceViewer'

<PeppolInvoiceViewer xml={xml} locale="nl-BE" />
<PeppolInvoiceViewer invoice={parsedInvoice} locale="fr-BE" />
```

[The model](src/model.ts) describes the viewer input. [The UBL parser](src/parseUbl.ts) returns a result with missing-field warnings or an error code. Only the XML input requires the browser's XML parser. A future backend or CII parser can supply the same model.

[Official fixture source](https://github.com/OpenPEPPOL/peppol-bis-invoice-3/tree/master/rules/examples). The edge fixtures deliberately contain partial documents to exercise field extraction and warnings. Inline PDF preview depends on browser PDF support.
