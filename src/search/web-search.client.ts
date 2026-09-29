import { BadGatewayException, Injectable } from '@nestjs/common';

// DuckDuckGo's Instant Answer API is used because it needs no API key, which
// keeps the project runnable out of the box. The response shape is different
// per result kind, so each is mapped to the same flat result object.
const ENDPOINT = 'https://api.duckduckgo.com/';
const TIMEOUT_MS = 10_000;

interface RawInstantAnswer {
  Heading?: string;
  AbstractText?: string;
  AbstractURL?: string;
  AbstractSource?: string;
  Answer?: string;
  AnswerURL?: string;
  Definition?: string;
  DefinitionURL?: string;
  DefinitionSource?: string;
  RelatedTopics?: (RawTopic | string)[];
  Results?: RawTopic[];
}

interface RawTopic {
  Text?: string;
  FirstURL?: string;
  Topics?: RawTopic[];
}

@Injectable()
export class WebSearchClient {
  async search(query: string, limit: number): Promise<{ title: string; url: string; snippet: string }[]> {
    const url = new URL(ENDPOINT);
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'json');
    // Without these the response includes large HTML blobs we would only strip
    // out again.
    url.searchParams.set('no_html', '1');
    url.searchParams.set('skip_disambig', '1');

    let response: Response;
    try {
      response = await fetch(url, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { accept: 'application/json' },
      });
    } catch {
      // The search backend has no API key to leak, so the message is safe to be
      // specific here.
      throw new BadGatewayException('Could not reach the search provider');
    }

    if (!response.ok) {
      throw new BadGatewayException('The search provider returned an error');
    }

    const data = (await response.json()) as RawInstantAnswer;
    return this.toResults(data, limit);
  }

  private toResults(data: RawInstantAnswer, limit: number) {
    const results: { title: string; url: string; snippet: string }[] = [];

    // The abstract is the highest-quality single answer, so it leads.
    if (data.AbstractText && data.AbstractURL) {
      results.push({
        title: data.Heading || data.AbstractSource || data.AbstractURL,
        url: data.AbstractURL,
        snippet: data.AbstractText,
      });
    }

    if (data.Answer && data.AnswerURL) {
      results.push({ title: data.Answer, url: data.AnswerURL, snippet: data.Answer });
    }

    if (data.Definition && data.DefinitionURL) {
      results.push({
        title: data.DefinitionSource || data.DefinitionURL,
        url: data.DefinitionURL,
        snippet: data.Definition,
      });
    }

    for (const topic of [...(data.RelatedTopics ?? []), ...(data.Results ?? [])]) {
      this.flattenTopic(topic, results);
      if (results.length >= limit * 2) {
        break;
      }
    }

    const seen = new Set<string>();
    return results
      .filter((result) => {
        if (seen.has(result.url)) {
          return false;
        }
        seen.add(result.url);
        return true;
      })
      .slice(0, limit);
  }

  // RelatedTopics nests two levels deep for entity hierarchies.
  private flattenTopic(
    topic: RawTopic | string,
    results: { title: string; url: string; snippet: string }[],
  ): void {
    if (typeof topic === 'string') {
      return;
    }
    if (topic.Topics) {
      for (const nested of topic.Topics) {
        this.flattenTopic(nested, results);
      }
      return;
    }
    if (topic.Text && topic.FirstURL) {
      // Text often arrives as "Title - snippet"; split on the first dash.
      const separatorIndex = topic.Text.indexOf(' - ');
      const title =
        separatorIndex > 0 ? topic.Text.slice(0, separatorIndex) : topic.Text;
      const snippet =
        separatorIndex > 0 ? topic.Text.slice(separatorIndex + 3) : topic.Text;
      results.push({ title, url: topic.FirstURL, snippet });
    }
  }
}
