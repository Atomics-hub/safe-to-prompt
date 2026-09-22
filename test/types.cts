import {canPrompt, describeEnvironment} from 'safe-to-prompt';
const ok: boolean = canPrompt({env: {}, stdin: {isTTY: false}});
const reason: string = describeEnvironment().reason;
void [ok, reason];
