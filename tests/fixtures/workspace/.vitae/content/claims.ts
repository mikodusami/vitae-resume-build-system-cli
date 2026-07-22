export default [
  {
    id: 'etl',
    defensibility: 'needs-review',
    reviewNotes: [
      'Read the ETL entrypoint end to end; sketch sources to outputs',
      'Know one concrete data-quality check and one failure it catches',
    ],
  },
  { id: 'ranker', defensibility: 'confident' },
];
