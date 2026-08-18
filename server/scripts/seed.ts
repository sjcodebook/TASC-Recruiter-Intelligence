import { Container } from "@freshgum/typedi";
import { DataBootstrapService } from "../src/services/data-bootstrap.service.js";
import { DatabaseService } from "../src/infrastructure/database/database.service.js";

const bootstrap = Container.get(DataBootstrapService);
const database = Container.get(DatabaseService);

try {
  const result = await bootstrap.seed();
  console.log(`Seeded ${result.roles} roles and ${result.candidates} candidates with OpenAI embeddings.`);
} finally {
  await database.close();
}
