import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { format } from 'prettier';
import xml2js from 'xml2js';
import fs from 'fs';
import beautify from 'js-beautify'
import formatXml from 'xml-formatter';
import { parse } from 'parse5';
import validateCss from 'css-validator';
import csvtojson from 'csvtojson';
import { XmlValidator } from 'xml-validator';

const app = express();

app.use(cors({
    origin: ['http://localhost:3000']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));


// Multer setup
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, file.originalname);
    }
});

const upload = multer({ storage: storage });

app.get('/', (req, res) => {
    try {
        return res.status(200).json({status: "Backend is working"})
    } catch (error) {
        return res.status(400).json({status: "Backend is not working"})
    }
})

// Convert XML to JSON
app.post('/convert/xml-to-json', (req, res) => {
    try {
        const { xml } = req.body;
        if (!xml) {
            return res.status(400).json({ error: "XML data is required" });
        }

        const parser = new xml2js.Parser({ explicitArray: false });
        parser.parseString(xml, (error, result) => {
            if (error) {
                return res.status(400).json({ error: error.message });
            } else {
                return res.status(200).json({ json: result });
            }
        });
    } catch (error) {
        return res.status(400).json({ error: "An error occurred while processing the request." });
    }
});

// Convert JSON to XML
app.post('/convert/json-to-xml', async (req, res) => {
    try {
        let { json } = req.body;
        if (!json) {
            return res.status(400).json({ error: "JSON data is required" });
        }

        // If the JSON is passed as a string, parse it into an object
        if (typeof json === 'string') {
            json = JSON.parse(json);
        }

        // Sanitize keys in JSON data to comply with XML naming conventions
        json = sanitizeKeys(json);

        const builder = new xml2js.Builder();
        const xml = builder.buildObject(json);
        return res.status(200).send(xml);
    } catch (error) {
        // let errorMessage = "An error occurred while processing the request.";
        // if (error instanceof SyntaxError) {
        //     errorMessage = "Invalid JSON format. Please check the syntax and try again.";
        // } else if (error instanceof xml2js.ValidationError || error instanceof xml2js.ParserError) {
        //     errorMessage = "Error converting JSON to XML. Please ensure the JSON structure is valid.";
        // }
        return res.status(400).json({ error });
    }
});

// Function to sanitize keys in JSON data to comply with XML naming conventions
function sanitizeKeys(json) {
    const sanitizedJson = {};
    for (const key in json) {
        const sanitizedKey = key.replace(/[^a-zA-Z0-9]/g, '_'); // Replace invalid characters with underscores
        sanitizedJson[sanitizedKey] = json[key];
    }
    return sanitizedJson;
}

// Convert CSV to JSON
app.post('/convert/csv-to-json', upload.single('csvFile'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No files were uploaded.' });
        }
        const csvFilePath = req.file.path;
        const jsonObj = await csvtojson().fromFile(csvFilePath);
        await fs.unlink(csvFilePath, (err) => {
            if (err) {
                console.error(err);
                throw err;
            }
        });
        res.status(200).json({ data: jsonObj });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// Convert JSON to CSV
app.post('/convert/json-to-csv', async (req, res) => {
    try {
        const { jsonData } = req.body;
        if (!jsonData || !Array.isArray(jsonData) || jsonData.length === 0) {
            return res.status(400).json({ error: 'Invalid JSON data provided.' });
        }
        // Convert JSON to CSV
        const csvData = await jsonToCSV(jsonData);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=data.csv');
        res.status(200).send(csvData);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

async function jsonToCSV(jsonData) {
    const fields = Object.keys(jsonData[0]);
    const csv = jsonData.map(row => fields.map(fieldName => JSON.stringify(row[fieldName])).join(','));
    csv.unshift(fields.join(',')); // Add headers

    return csv.join('\n');
}

app.post('/upload', upload.single('file'), async (req, res) => {

    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = req.file.path;
    console.log("File path", filePath);

    fs.readFile(filePath, 'utf8', async (err, data) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to read the uploaded file' });
        }

        try {
            console.log(data);
            const formattedCode = await format(data, { parser: 'json' });
            console.log(formattedCode)
            res.status(200).json({ formattedCode });
        } catch (error) {
            console.log("Error inside formatting the json");
            res.status(400).json({ error: error.message });
        }

        fs.unlink(filePath, (err) => {
            if (err) {
                console.error('Failed to delete the uploaded file:', err);
            }
        });
    });
});

app.post('/format/json', async (req, res) => {
    try {
        const { json } = req.body;
        const formattedCode = await format(json, { parser: 'json' });
        console.log(formattedCode)
        res.status(200).json({ json: formattedCode });
    } catch (error) {
        console.log("Error inside formatting the json");
        res.status(400).json({ error: error.message });
    }
});

app.post('/format/html', async (req, res) => {
    try {
        const { html } = req.body;
        if (!html) {
            return res.status(400).json({ error: "Enter some html to format" })
        }
        const prettyHTML = beautify.html(html, {
            indent_size: 4,
        });
        console.log(prettyHTML);
        return res.status(200).json({ html: prettyHTML });
    } catch (error) {
        console.log(error);
        res.status(404).json({ error });
    }
});

app.post('/format/css', async (req, res) => {
    try {
        const { css } = req.body;
        const prettyCSS = beautify.css(css, {
            indent_size: 4,
        });
        console.log(prettyCSS);
        return res.status(200).json({ css: prettyCSS });
    } catch (error) {
        console.log(error);
        res.status(404).json({ error });
    }
});

app.post('/format/javascript', async (req, res) => {
    try {
        const { javascript } = req.body;
        console.log(javascript)
        const prettyJS = beautify.js(javascript, {
            indent_size: 4,
        });
        return res.status(200).json({ javascript: prettyJS });
    } catch (error) {
        console.log(error);
        res.status(404).json({ error });
    }
});

app.post('/format/xml', async (req, res) => {
    try {
        const { xml } = req.body;
        const indentation = '    ';
        const formattedXml = formatXml(xml, { indentation });
        console.log(formattedXml);
        return res.status(200).json({ xml: formattedXml });
    } catch (error) {
        console.log(error);
        res.status(404).json({ error });
    }
});

app.post('/validate/json', async (req, res) => {
    const { json } = req.body;
    try {
        console.log("Inside validate/json")
        await JSON.parse(json);
        return res.status(200).json({ valid: true });
    } catch (error) {
        return res.status(400).json({ valid: false, error: "Invalid JSON format. Please check the syntax and try again." });
    }
});

app.post('/validate/xml', async (req, res) => {
    try {
        const { xml } = req.body;
        const validator = new XmlValidator();
        const validation = validator.validate(xml)
        if (validation.error) {
            return res.status(400).json({ valid: false, error: validation.error });
        }
        return res.status(200).json({ valid: true, result: validation.isValid });
    } catch (error) {
        return res.status(400).json({ valid: false, error: "Invalid XML format. Please check the syntax and try again." });
    }
});

app.post('/validate/html', async (req, res) => {
    try {
        const { html } = req.body;
        const document = parse(html);

        // Check if the parsed document contains any elements
        const hasElements = document.childNodes.some(node => node.tagName !== undefined);

        if (!hasElements) {
            return res.status(400).json({ valid: false, error: "Invalid HTML format. Please check the syntax and try again." });
        }

        // If parsing succeeds without error and contains elements, HTML is considered valid
        return res.status(200).json({ valid: true });
    } catch (error) {
        return res.status(400).json({ valid: false, error: "Invalid HTML format. Please check the syntax and try again.", err: error.message });
    }
});

app.post('/validate/css', async (req, res) => {
    try {
        const { css } = req.body;

        // Validate CSS using css-validator
        validateCss({ text: css }, function (err, data) {
            if (err) {
                return res.status(400).json({ valid: false, error: "Error occurred while validating CSS.", err: err.message });
            }

            // Check validation results
            const isValid = data.validity;
            const errors = data.errors || [];
            const warnings = data.warnings || [];

            return res.status(200).json({ valid: isValid, errors, warnings });
        });
    } catch (error) {
        return res.status(400).json({ valid: false, error: "Invalid CSS format. Please check the syntax and try again.", err: error.message });
    }
});

app.listen(4000, () => {
    console.log("Server started at port 4000");
});

module.exports = app;