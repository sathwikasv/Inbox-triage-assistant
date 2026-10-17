// Entry points Gmail and Apps Script call by name (scripts/build.mjs turns each export into a global function).
export { onHomepage, onGmailMessage, onDraft, onCorrect, onHuman, onDone, onScanNow, onSettings, onSaveSettings, onSeed, onCompose, onInsertReply } from "./cards";
export { scanInbox, installScanTrigger, removeScanTrigger } from "./scanner";
export { seedDemoInbox } from "./seed";
