import { useEffect, useState } from 'react';

export const REVIEW_WAIT_MESSAGES = [
  'Reading the changes…',
  'Thinking through edge cases…',
  'Hunting for bugs…',
  'Checking your conventions…',
  'Looking for missing tests…',
  'Polishing the feedback…',
];

export const EXPLAIN_WAIT_MESSAGES = [
  'Reading the changes…',
  'Following the logic…',
  'Working out what moved and why…',
  'Putting it in plain words…',
];

const WAIT_MESSAGE_INTERVAL = 6000;

export function useWaitMessage(busy: boolean, messages: readonly string[]): { key: number; text: string } {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!busy) return;
    setIndex(Math.floor(Math.random() * messages.length));
    const timer = setInterval(() => setIndex((i) => i + 1), WAIT_MESSAGE_INTERVAL);
    return () => clearInterval(timer);
  }, [busy, messages.length]);
  return { key: index, text: messages[index % messages.length] ?? '' };
}
