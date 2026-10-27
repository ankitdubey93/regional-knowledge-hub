import { app } from './app';
import { env } from './env';
import { chatConfigProblem } from './ai/chat';

const problem = chatConfigProblem();
if (problem) throw new Error(problem);

app.listen(env.PORT, () => console.log(`server listening on http://localhost:${env.PORT}`));
