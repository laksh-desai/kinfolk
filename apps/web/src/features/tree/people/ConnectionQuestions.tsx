import { NEW_PERSON, type ConnectionStep, type Via } from '@kinfolk/shared/relatives/planAddRelative';
import { RadioGroup } from '../../../components/RadioGroup';

interface ConnectionQuestionsProps {
  steps: ConnectionStep[];
  via: Via;
  onAnswer: (key: keyof Via, value: string) => void;
}

/** "On which parent’s side?", "Whose child are they?" — one radio group per question. */
export function ConnectionQuestions({ steps, via, onAnswer }: ConnectionQuestionsProps) {
  return (
    <>
      {steps.map((step) => (
        <RadioGroup
          key={step.key}
          legend={step.question}
          name={`via-${step.key}`}
          value={via[step.key] ?? ''}
          onChange={(value) => onAnswer(step.key, value)}
          options={[
            ...step.options.map((option) => ({ value: option.id, label: option.label })),
            ...(step.allowsNew
              ? [
                  {
                    value: NEW_PERSON,
                    label: step.key === 'unionId' ? 'With someone not in the tree yet' : 'Someone not in the tree yet',
                    description: 'An unnamed placeholder is added for them. You can name them anytime.',
                  },
                ]
              : []),
          ]}
        />
      ))}
    </>
  );
}
