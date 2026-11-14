
interface ConsultaParametros {
    RA: number;
    DEC: number;
    Data: Date;
}

const parametros: ConsultaParametros = {
    RA: 215.341667,
    DEC: -23.550520,
    Data: new Date("2026-11-14")
};

 function consultar(parametros: ConsultaParametros) {
    // const response = await fetch(
    //     "http://localhost:3000/api/consulta",
    //     {
    //         method: "POST",
    //         headers: {
    //             "Content-Type": "application/json"
    //         },
    //         body: JSON.stringify(parametros)
    //     }
    // );

    // if (!response.ok) {
    //     throw new Error("Erro ao realizar consulta");
    // }

    console.log("Consulta realizada com sucesso!");
    
    return "testee";

    // return await response.json();

}

