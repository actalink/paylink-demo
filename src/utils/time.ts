export const generateExecutionTimes = (
  startInMs: number,
  freq: string,
  times: number
) => {
  const execTimes: Array<number> = [];
  execTimes.push(startInMs);

  if (times === 1) {
    return execTimes;
  }

  for (let i = 1; i < times; i++) {
    let nextDateInMs: number;

    switch (freq) {
      case "5mins":
        nextDateInMs = startInMs + i * 5 * 60 * 1000;
        break;

      case "daily":
        nextDateInMs = startInMs + i * 24 * 60 * 60 * 1000;
        break;

      case "week":
        nextDateInMs = startInMs + i * 7 * 24 * 60 * 60 * 1000;
        break;

      case "month": {
        const startMonthDate = new Date(startInMs);
        startMonthDate.setMonth(startMonthDate.getMonth() + i);
        nextDateInMs = startMonthDate.getTime();
        break;
      }

      case "quarter": {
        const startQuarterDate = new Date(startInMs);
        startQuarterDate.setMonth(startQuarterDate.getMonth() + i * 3);
        nextDateInMs = startQuarterDate.getTime();
        break;
      }

      case "half year": {
        const startHalfYearDate = new Date(startInMs);
        startHalfYearDate.setMonth(startHalfYearDate.getMonth() + i * 6);
        nextDateInMs = startHalfYearDate.getTime();
        break;
      }

      case "year": {
        const startYearDate = new Date(startInMs);
        startYearDate.setFullYear(startYearDate.getFullYear() + i);
        nextDateInMs = startYearDate.getTime();
        break;
      }

      default:
        throw new Error(`Invalid frequency: ${freq}`);
    }

    execTimes.push(nextDateInMs);
  }

  return execTimes;
};
