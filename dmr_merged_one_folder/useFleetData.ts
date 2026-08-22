import { useMemo } from 'react';
import { getMaintenance, getDocuments, getFastags, getFastagTransactions, getEMIRecords } from '../services/storage';

export function useFleetData() {
  const maintenance = useMemo(() => getMaintenance(), []);
  const documents = useMemo(() => getDocuments(), []);
  const fastags = useMemo(() => getFastags(), []);
  const fastagTransactions = useMemo(() => getFastagTransactions(), []);
  const emiRecords = useMemo(() => getEMIRecords(), []);

  return { maintenance, documents, fastags, fastagTransactions, emiRecords };
}