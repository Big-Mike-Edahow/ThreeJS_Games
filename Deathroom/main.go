// main.go

package main

import (
	"html/template"
	"log"
	"net/http"
)

func main() {
	mux := http.NewServeMux()

	fileServer := http.FileServer(http.Dir("./static"))
	mux.Handle("/static/", http.StripPrefix("/static", fileServer))
	
	mux.HandleFunc("/", indexHandler)

	log.Println("Starting HTTP Server on port 8080...")
	err := http.ListenAndServe(":8080", logRequest(mux))
	if err != nil {
		log.Fatal("Error occurred while starting the server:", err)
	}
}

func indexHandler(w http.ResponseWriter, r *http.Request) {
	indexTemplate := template.Must(template.ParseFiles("./templates/index.html"))
	indexTemplate.Execute(w, nil)
}

func logRequest(handler http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		log.Printf("%s %s %s %s\n", r.RemoteAddr, r.Proto, r.Method, r.URL)
		handler.ServeHTTP(w, r)
	})
}
