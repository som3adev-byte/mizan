import { notFound } from "next/navigation";

/** Any path that matches no page lands here, so the localized not-found page renders. */
export default function CatchAll() {
  notFound();
}
