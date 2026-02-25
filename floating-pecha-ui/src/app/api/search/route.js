import { Client } from '@opensearch-project/opensearch';
import { NextResponse } from 'next/server';

// Initialize the OpenSearch client safely for native local development
const client = new Client({
  node: process.env.OPENSEARCH_URL || 'http://localhost:9200',
});

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q');

  // Safely parse the user level. If it's undefined or invalid, lock it down to Level 0
  const levelParam = searchParams.get('level');
  const userLevel = levelParam && !isNaN(levelParam) ? parseInt(levelParam, 10) : 0;

  if (!q) {
    return NextResponse.json({ results: [] });
  }

  try {
    const response = await client.search({
      index: 'khyentse-archive-segments',
      body: {
        query: {
          bool: {
            must: [
              {
                match_phrase: {
                  text: q
                }
              }
            ],
            // The "Access Onion" Filter
            filter: [
              {
                range: {
                  access_level: {
                    lte: userLevel
                  }
                }
              }
            ]
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
        size: 50
      }
    });

    const hits = response.body.hits.hits.map(hit => ({
      id: hit._id,
      score: hit._score,
      ...hit._source,
      highlight: hit.highlight?.text?.[0] || hit._source.text
    }));

    return NextResponse.json({ results: hits });

  } catch (error) {
    console.error("OpenSearch Error:", error.meta?.body?.error || error.message || error);
    return NextResponse.json({ error: "Failed to search the archive" }, { status: 500 });
  }
}