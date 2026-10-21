"use client";
export default function Error({ error }: { error: Error }) {
  return <p role="alert">Could not load Workspace369 data: {error.message}</p>;
}
