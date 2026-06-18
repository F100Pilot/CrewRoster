import { useRef, useState } from 'react';
import { Button, CircularProgress, Paper, Typography } from '@mui/material';
import { CloudUpload } from '@mui/icons-material';
import { useRoster } from '../state/useRoster';

export default function UploadDropzone() {
  const { importFile, importing } = useRoster();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file) importFile(file);
  };

  return (
    <Paper
      variant="outlined"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        handleFiles(e.dataTransfer.files);
      }}
      sx={{
        p: 4,
        textAlign: 'center',
        borderStyle: 'dashed',
        borderWidth: 2,
        borderColor: dragOver ? 'primary.main' : 'divider',
        bgcolor: dragOver ? 'action.hover' : 'background.paper',
        transition: 'all 0.15s',
      }}
    >
      <CloudUpload sx={{ fontSize: 56, color: 'primary.main', mb: 1 }} />
      <Typography variant="h6" gutterBottom>
        Importar escala
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Exporta a tua escala do CrewLink e arrasta o ficheiro para aqui.
        <br />
        Formatos suportados: PDF, CSV, ICS.
      </Typography>
      <Button
        variant="contained"
        startIcon={importing ? <CircularProgress size={18} color="inherit" /> : <CloudUpload />}
        onClick={() => inputRef.current?.click()}
        disabled={importing}
      >
        {importing ? 'A processar…' : 'Escolher ficheiro'}
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.csv,.ics"
        hidden
        onChange={(e) => handleFiles(e.target.files)}
      />
    </Paper>
  );
}
