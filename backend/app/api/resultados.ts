
import express from "express";

const app = express();

app.use(express.json());

app.post("/api/consulta", async (req, res) => {
    try {
        const response = await fetch(
            "http://localhost:8000/receber-dados",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(req.body)
            }
        );

        const resultado = await response.json();

        res.status(response.status).json(resultado);

    } catch (error) {
        res.status(500).json({
            erro: "Falha na comunicação com FastAPI"
        });
    }
});

app.listen(3000, () => {
    console.log("Node.js iniciado na porta 3000");
});
