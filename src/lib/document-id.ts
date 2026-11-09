import { z } from "zod";
/** A document ID, never a nested path. Keep Unicode IDs while rejecting reserved/control names. */
export const firestoreDocumentId = (maximum = 128) =>
  z
    .string()
    .min(1)
    .max(maximum)
    .regex(/^[^/\u0000-\u001f\u007f]+$/)
    .refine(
      (value) => value !== "." && value !== ".." && !/^__.*__$/.test(value),
    );
