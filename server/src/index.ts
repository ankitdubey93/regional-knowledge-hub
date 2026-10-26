import { app } from './app';
import { env } from './env';

app.listen(env.PORT, () => console.log(`server listening on http://localhost:${env.PORT}`));
