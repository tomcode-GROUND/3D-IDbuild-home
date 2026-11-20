import { z } from "zod";

// Zod's optional JIT probe triggers a CSP violation even when it catches the
// blocked Function constructor. Use its interpreter under our strict policy.
z.config({ jitless: true });
export { z };
