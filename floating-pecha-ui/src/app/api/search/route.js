import { Client } from '@opensearch-project/opensearch';
import { NextResponse } from 'next/server';

// Initialize the OpenSearch client (Plain HTTP to match our Docker setup)
const client = new Client({
  node: process.env.OPENSEARCH_URL || 'http://localhost:9200',
});

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q');

  if (!q) {
    return NextResponse.json({ results: [] });
  }

  try {
    const response = await client.search({
      index: 'khyentse-archive-segments',
      body: {
        query: {
          match_phrase: {
            text: q // match_phrase ensures syllables are found in the correct order
          }
        },
        highlight: {
          fields: {
            text: {
              pre_tags: ['<mark class="bg-[#f7f3e7] text-[#D4AF37] font-bold px-1 rounded">'],
              post_tags: ['</mark>']
            }
          }
        },
        size: 50 // limit to top 50 results
      }
    });

    const hits = response.body.hits.hits.map(hit => ({
      id: hit._id,
      score: hit._score,
      ...hit._source,
      // Use the highlighted text if available, otherwise fallback to standard text
      highlight: hit.highlight?.text?.[0] || hit._source.text
    }));

    return NextResponse.json({ results: hits });
  } catch (error) {
    console.error('OpenSearch Error:', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}