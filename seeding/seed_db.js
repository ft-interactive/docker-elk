const { Client } = require('elasticsearch');
const axios = require('axios');
const { writeFileSync } = require('fs');

const es = Client({
  host: '192.168.99.100:9200',
});

const mappings = {
  "tweet": {
    "properties": {
      "@timestamp": {
        "type": "date"
      },
      "@version": {
        "type": "text",
        "fields": {
          "keyword": {
            "type": "keyword",
            "ignore_above": 256
          }
        }
      },
      "@imported-from": {
        "type": "text",
        "fields": {
          "keyword": {
            "type": "keyword",
            "null_value": "Twitter API"
          }
        }
      },
      "text": {
        "type": "text",
        "fielddata": true, // IT GOIN' DOWN FER REALZ
        "fields": {
          "keyword": {
            "type": "keyword",
            "ignore_above": 140
          }
        }
      }
    }
  }
}

async function getAllTrumpTweets(rangeStart = 2009, rangeEnd = 2017) {
  const years = Array(rangeEnd)
    .fill(1)
    .map(function(v, i) { return i + 1; }).filter(v => v >= rangeStart && v <= rangeEnd);
  const data = await Promise.all(years.map(async year => {
    const endpoint = `http://trumptwitterarchive.com/data/realdonaldtrump/${year}.json`;
    const yearData = (await axios.get(endpoint)).data;
    return yearData.map(v => {
      return {
        '@timestamp': new Date(v.created_at).toISOString(),
        '@imported-from': 'http://trumptwitterarchive.com/',
        source: v.source,
        user_id: '25073877',
        user: {
          name: 'Donald Trump',
          screen_name: 'realdonaldtrump',
        },
        in_reply_to_screen_name: v.in_reply_to_screen_name,
        id: +v.id_str,
        id_str: v.id_str,
        retweet_count: v.retweet_count,
        retweeted: v.is_retweet,
        favorite_count: v.favorite_count,
        text: v.text,
      };
    });
  }));

  return data.reduce((col, cur) => col.concat(cur));
}

getAllTrumpTweets()
.then(async data => {
  try {
    await es.indices.get({index: 'tweets'});
  } catch (e) {
    console.error(e);
    console.log('Creating index afresh');
    try {
      await es.indices.create({
        index: 'tweets',
        body: {
          mappings,
        }
      });
    } catch (ee) {
      console.error(ee);
    }
  }

  try {
    const result = await data.reduce(async (queue, tweet) => {
      try {
        const data = await queue;
        data.push(await es.index({
          index: 'tweets',
          type: 'tweet',
          body: tweet,
        }));

        return data;
      } catch (e) {
        console.error(e);
        return await queue;
      }
    }, Promise.resolve([]));

    console.dir(result);
  } catch (e) {
    console.error(e);
  }
});
