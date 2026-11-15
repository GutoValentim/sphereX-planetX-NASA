export interface ConsultaParametros {
    RA: number;
    DEC: number;
    Data: Date;
}

export const parametros: ConsultaParametros = {
    RA: 215.341667,
    DEC: -23.550520,
    Data: new Date("2026-11-14")
};

// export async function consultar(parametros: ConsultaParametros) {
//     const query = new URLSearchParams({
//         RA: String(parametros.RA),
//         DEC: String(parametros.DEC),
//         Data: parametros.Data.toISOString()
//     });
//     const response = await fetch(
//         `https://api.spherex.prospectordigital.com.br/api/consulta?${query}`
//     );

//     if (!response.ok) {
//         throw new Error("Erro ao realizar consulta");
//     }

//     return await response.json();
// }

export async function consultar(parametros: ConsultaParametros): Promise<string> {
    void parametros;
    return "Texto de teste";
}
