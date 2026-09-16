import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { RadioGroup } from './RadioGroup';

const OPTIONS = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];

function TwoGroups() {
  const [first, setFirst] = useState('yes');
  const [second, setSecond] = useState('yes');
  return (
    <>
      <RadioGroup legend="First question" name="answer" value={first} options={OPTIONS} onChange={setFirst} />
      <RadioGroup legend="Second question" name="answer" value={second} options={OPTIONS} onChange={setSecond} />
    </>
  );
}

describe('RadioGroup', () => {
  it('keeps each group’s own answer when two groups are given the same name', async () => {
    const user = userEvent.setup();
    render(<TwoGroups />);
    const first = screen.getByRole('group', { name: 'First question' });
    const second = screen.getByRole('group', { name: 'Second question' });
    await user.click(within(first).getByRole('radio', { name: 'No' }));
    expect(within(first).getByRole('radio', { name: 'No' })).toBeChecked();
    expect(within(second).getByRole('radio', { name: 'Yes' })).toBeChecked();
    expect(within(second).getByRole('radio', { name: 'No' })).not.toBeChecked();
  });
});
