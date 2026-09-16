import { z } from 'zod';
import type { TreeGraph } from './graph';
import type { TreeStatus } from './tree';

export const CHANGE_REQUEST_MIN = 15;

export const submitReviewSchema = z.object({
  reviewerEmail: z
    .string({ required_error: 'Enter your reviewer’s email address.' })
    .trim()
    .min(1, 'Enter your reviewer’s email address.')
    .email('Enter an email address like name@example.com.')
    .transform((value) => value.toLowerCase()),
  note: z
    .string()
    .trim()
    .max(2000, 'Use 2000 characters or fewer for the note.')
    .optional()
    .transform((value) => (value ? value : null)),
});
export type SubmitReviewInput = z.input<typeof submitReviewSchema>;

export const changeRequestSchema = z.object({
  body: z
    .string({ required_error: 'Say what needs changing.' })
    .trim()
    .min(CHANGE_REQUEST_MIN, `Say what needs changing in a sentence or two (at least ${CHANGE_REQUEST_MIN} characters).`)
    .max(5000, 'Use 5000 characters or fewer.'),
});
export type ChangeRequestInput = z.input<typeof changeRequestSchema>;

export interface ChangeRequestDto {
  id: string;
  body: string;
  status: 'open' | 'resolved';
  author: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface ReviewAssignmentDto {
  id: string;
  reviewerEmail: string;
  /** The reviewer's name once they have opened the link and claimed it. */
  reviewerName: string | null;
  note: string | null;
  sentBy: string | null;
  sentAt: string;
  decision: 'approved' | 'changes_requested' | null;
  decidedAt: string | null;
}

/** The owner's view of where their tree stands (SPEC §5.7). */
export interface ReviewStateDto {
  status: TreeStatus;
  assignment: ReviewAssignmentDto | null;
  changeRequests: ChangeRequestDto[];
}

/** What the reviewer sees at /review/:token: the whole tree. */
export interface ReviewTreeDto {
  tree: { id: string; name: string; status: TreeStatus };
  graph: TreeGraph;
  assignment: ReviewAssignmentDto;
  changeRequests: ChangeRequestDto[];
}
