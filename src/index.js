const AWS = require('aws-sdk');
const UUID4 = require('uuid4');
const Discord = require('discord.js');

AWS.config.update({ region: process.env.AWS_REGION });
const docClient = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();

const urlRegEx =
  /(https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*))/g;
const headers = {
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Origin': 'https://pages.annemunition.tv',
  'Access-Control-Allow-Methods': 'POST',
};

exports.handler = async (event) => {
  if (typeof event.body === 'string') event.body = JSON.parse(event.body);

  console.log(event.path);
  if (event.path === '/discord_user_report') {
    await submitReport(event);
    return {
      statusCode: 204,
      headers,
    };
  }
  if (event.path === '/discord_user_report/signatures') {
    const signatures = await getSignatures(event);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(signatures),
    };
  }
};

async function submitReport(event) {
  const webhook = new Discord.WebhookClient(
    process.env.WEBHOOK_ID,
    process.env.WEBHOOK_TOKEN,
  );
  const { reporter, reported, message, files = [] } = event.body;

  const index = await incIndex();

  const attachments = files.map((f) => {
    return {
      attachment: f,
      name: f,
    };
  });

  await webhook.send(`@here\n\n${message.replace(urlRegEx, '<$1>')}`, {
    username: `REPORT #${index} | From: ${reporter} | Against: ${reported}`,
    files: attachments,
  });

  return { statusCode: 204 };
}

function incIndex() {
  const params = {
    TableName: 'counts',
    Key: {
      key: 'discord_report_index',
    },
    AttributeUpdates: {
      count: {
        Action: 'ADD',
        Value: 1,
      },
    },
    ReturnValues: 'UPDATED_NEW',
  };

  return new Promise((resolve, reject) => {
    docClient.update(params, function (err, data) {
      if (err) {
        reject(err);
      } else {
        resolve(data.Attributes.count);
      }
    });
  });
}

async function getSignatures(event) {
  const { files = [] } = event.body;
  console.log('getting signatures for', files);
  const signatures = [];

  for (let i = 0; i < files.length; i++) {
    const signature = await getSignature(files[i]);
    signatures.push(signature);
  }

  return signatures;
}

function getSignature(file) {
  return new Promise((resolve, reject) => {
    s3.getSignedUrl(
      'putObject',
      {
        Bucket: process.env.BUCKET_NAME,
        Key: `discord_user_report_attachments/${UUID4()}.${file.ext}`,
        ContentType: file.type,
      },
      function (err, url) {
        if (err) {
          reject(err);
        } else {
          resolve(url);
        }
      },
    );
  });
}
