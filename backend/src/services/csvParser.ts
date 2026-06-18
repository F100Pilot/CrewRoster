import { parse } from 'csv-parse/sync';

export interface ParsedDuty {
  date: string;
  dutyCode: string;
  dutyType: string;
  reportingTime: string | null;
  departureTime: string | null;
  arrivalTime: string | null;
  flightNumber: string | null;
  departureAirport: string | null;
  arrivalAirport: string | null;
  aircraftType: string | null;
  observations: string | null;
}

function inferDutyType(dutyCode: string): string {
  const code = dutyCode.toUpperCase();
  if (['FLT', 'FDP', 'FP', 'FD'].includes(code)) return 'Flight Duty';
  if (['SBY', 'SBY-A', 'STA'].includes(code)) return 'Standby Airport';
  if (['SBY-H', 'STH'].includes(code)) return 'Standby Home';
  if (['OFF', 'DO', 'DOF'].includes(code)) return 'Day Off';
  if (['VAC', 'VACATION', 'AN'].includes(code)) return 'Vacation';
  if (['SIM', 'SIMU', 'TRN'].includes(code)) return 'Simulator';
  if (['OFD', 'OFFICE', 'GRD'].includes(code)) return 'Office Duty';
  if (['TRG', 'TRNG', 'TR'].includes(code)) return 'Training';
  if (['MED', 'MC', 'MEDICAL'].includes(code)) return 'Medical';
  if (['RSV', 'R'].includes(code)) return 'Reserve';
  if (['POS', 'DH'].includes(code)) return 'Positioning';
  return 'Other';
}

export async function parseCSV(content: string): Promise<ParsedDuty[]> {
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  });

  const duties: ParsedDuty[] = [];

  for (const row of records) {
    // Map common NetLine CrewLink CSV columns to our format
    const date = row['Date'] || row['date'] || row['Datum'] || '';
    const dutyCode = row['DutyCode'] || row['duty_code'] || row['Code'] || '';
    const reportingTime = row['ReportingTime'] || row['reporting_time'] || row['Report'] || null;
    const departureTime = row['DepartureTime'] || row['departure_time'] || row['STD'] || null;
    const arrivalTime = row['ArrivalTime'] || row['arrival_time'] || row['STA'] || null;
    const flightNumber = row['FlightNumber'] || row['flight_number'] || row['Flight'] || null;
    const departureAirport = row['DepartureAirport'] || row['departure_airport'] || row['Dep'] || null;
    const arrivalAirport = row['ArrivalAirport'] || row['arrival_airport'] || row['Arr'] || null;
    const aircraftType = row['AircraftType'] || row['aircraft_type'] || row['AC'] || null;
    const observations = row['Observations'] || row['observations'] || row['Notes'] || null;

    if (!date || !dutyCode) continue;

    duties.push({
      date,
      dutyCode,
      dutyType: inferDutyType(dutyCode),
      reportingTime,
      departureTime,
      arrivalTime,
      flightNumber,
      departureAirport,
      arrivalAirport,
      aircraftType,
      observations,
    });
  }

  return duties;
}
