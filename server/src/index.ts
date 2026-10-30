import { app } from './app';
import { env } from './env';
import { chatConfigProblem } from './ai/chat';
import { startRetentionJob } from './jobs/retention';
import { startNudgeJob } from './jobs/nudges';

const problem = chatConfigProblem();
if (problem) throw new Error(problem);

app.listen(env.PORT, () => {
  console.log(`server listening on http://localhost:${env.PORT}`);
  startRetentionJob();
  startNudgeJob();
});
