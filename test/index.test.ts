import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';

import * as IndexStack from '../lib/index';

test('Hoge Created', () => {
  const app = new cdk.App();
  const stack = new IndexStack.IndexStack(app, 'MyTestStack');
  const template = Template.fromStack(stack);

  template.toJSON();
});
