//
// TODO: Make this file a shareable library script for other actions to utilize
//
import * as fs from 'fs';
import * as os from 'os';
import * as yaml from 'js-yaml';

interface Inputs {
  [propName: string]: {
    description?: string;
    default?: string;
    required?: string;
  };
}

interface ActionsConfig {
  inputs?: Inputs;
}

/**
 * Rebuilds the usage section in the README.md so it's consistent with the action.yml.
 * @param actionReference - Full name of the action as to how it will be used
 * @param actionYamlPath - Path to the action.yml file
 * @param readmePath - Path to the README.md file
 * @param startToken - Token used to designate the start of where to insert dynamic content
 * @param endToken – Token used to designate the end of where to insert dynamic content
 */
function updateUsage(
  actionReference: string,
  actionYamlPath = 'action.yml',
  readmePath = 'README.md',
  startToken = '<!-- start usage -->',
  endToken = '<!-- end usage -->',
): void {
  if (!actionReference) {
    throw new Error('Parameter actionReference must not be empty');
  }

  const actionYaml = yaml.load(
    fs.readFileSync(actionYamlPath, 'utf-8').toString(),
  ) as ActionsConfig;

  const originalReadme = fs.readFileSync(readmePath).toString();

  const startTokenIndex = originalReadme.indexOf(startToken);
  if (startTokenIndex < 0) {
    throw new Error(`Start token '${startToken}' not found`);
  }

  const endTokenIndex = originalReadme.indexOf(endToken);
  if (endTokenIndex < 0) {
    throw new Error(`End token '${endToken}' not found`);
  } else if (endTokenIndex < startTokenIndex) {
    throw new Error('Start token must appear before end token');
  }

  // Build the new README
  const newReadme: string[] = [];

  // Append the beginning
  newReadme.push(originalReadme.substr(0, startTokenIndex + startToken.length));

  // Build the new usage section
  newReadme.push(
    '<!-- Warning: Content between these comments is auto-generated. Do NOT manually edit. -->',
    '```yaml',
    `- uses: ${actionReference}`,
    '  with:',
  );
  const { inputs = {} } = actionYaml;

  Object.keys(inputs).forEach((key, index) => {
    const input = inputs[key];

    // Line break between inputs
    if (index > 0) {
      newReadme.push('');
    }

    // Constrain the width of the description
    const width = 80;
    let description = (input.description as string)
      .trimRight()
      .replace(/\r\n/g, '\n') // Convert CR to LF
      .replace(/ +/g, ' ') // Squash consecutive spaces
      .replace(/ \n/g, '\n') // Squash space followed by newline
      .replace(/\n/, '\n\n'); // Add extra line break for paragraphs

    while (description) {
      // Longer than width? Find a space to break apart
      let segment = description;
      if (description.length > width) {
        segment = description.substr(0, width + 1);

        while (!segment.endsWith(' ') && !segment.endsWith('\n') && segment) {
          segment = segment.substr(0, segment.length - 1);
        }

        // Trimmed too much?
        if (segment.length < width * 0.67) {
          segment = description;
        }
      }

      // Check for newline
      const newlineIndex = segment.indexOf('\n');
      if (newlineIndex >= 0) {
        segment = segment.substr(0, newlineIndex + 1);
      }

      // Append segment
      newReadme.push(`    # ${segment}`.trimRight());

      // Remaining
      description = description.substr(segment.length);
    }

    if (input.default || input.required) {
      // Append blank line if default or required are set
      newReadme.push(`    #`);
    }

    if (input.default) {
      // Default
      newReadme.push(`    # Default: ${input.default}`);
    }

    if (input.required) {
      // Required
      newReadme.push(`    # Required: ${input.required}`);
    }

    // Input name
    newReadme.push(`    ${key}: ''`);
  });

  newReadme.push('```');

  // Append the end
  newReadme.push(originalReadme.substr(endTokenIndex));

  // Write the new README
  fs.writeFileSync(readmePath, newReadme.join(os.EOL));
}

updateUsage('reside-eng/workflow-status-notification-action@v1');
