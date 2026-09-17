import React from 'react';
import { DatePicker } from './DatePicker';

interface DobDatePickerProps {
  isoValue: string; // YYYY-MM-DD
  displayValue: string; // DD-MM-YYYY
  onChange: (isoDate: string, displayDate: string, calculatedAge: number) => void;
  error?: string;
}

export const DobDatePicker: React.FC<DobDatePickerProps> = ({
  isoValue,
  displayValue,
  onChange,
  error
}) => {
  const today = new Date();
  const todayYear = today.getFullYear();
  const todayMonth = today.getMonth();
  const todayDate = today.getDate();
  const todayIso = `${todayYear}-${String(todayMonth + 1).padStart(2, '0')}-${String(todayDate).padStart(2, '0')}`;

  const calculateAge = (isoDate: string): number => {
    if (!isoDate || isoDate.length !== 10) return 0;
    const parts = isoDate.split('-');
    if (parts.length !== 3) return 0;
    const bYear = parseInt(parts[0], 10);
    const bMonth = parseInt(parts[1], 10) - 1;
    const bDay = parseInt(parts[2], 10);

    let age = todayYear - bYear;
    const mDiff = todayMonth - bMonth;
    if (mDiff < 0 || (mDiff === 0 && todayDate < bDay)) {
      age--;
    }
    return Math.max(0, age);
  };

  const handleDateChange = (isoDate: string, displayDate: string) => {
    const age = calculateAge(isoDate);
    onChange(isoDate, displayDate, age);
  };

  return (
    <DatePicker
      isoValue={isoValue}
      displayValue={displayValue}
      onChange={handleDateChange}
      placeholder="DD-MM-YYYY"
      error={error}
      minYear={1920}
      maxYear={todayYear}
      maxDateIso={todayIso}
    />
  );
};
